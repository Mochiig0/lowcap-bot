import "dotenv/config";

import { db } from "./db.js";

type MetricsReportArgs = {
  mint?: string;
  tokenId?: number;
  source?: string;
  rank?: string;
  hasPeakFdv24h?: boolean;
  hasMaxMultiple15m?: boolean;
  hasTimeToPeakMinutes?: boolean;
  hasVolume24h?: boolean;
  hasPeakPrice15m?: boolean;
  sortBy?: SortField;
  sortOrder: SortOrder;
  limit: number;
};

type SortField =
  | "observedAt"
  | "peakFdv24h"
  | "maxMultiple15m"
  | "timeToPeakMinutes";

type SortOrder = "asc" | "desc";

type MetricReportItem = {
  id: number;
  token: {
    mint: string;
    name: string | null;
    symbol: string | null;
    scoreRank: string;
    scoreTotal: number;
  };
  source: string | null;
  observedAt: string;
  peakPrice15m: number | null;
  maxMultiple15m: number | null;
  peakFdv24h: number | null;
  volume24h: number | null;
  peakFdv7d: number | null;
  volume7d: number | null;
  timeToPeakMinutes: number | null;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metrics:report -- [--mint <MINT>] [--tokenId <ID>] [--source <SOURCE>] [--rank <RANK>] [--hasPeakFdv24h <true|false>] [--hasMaxMultiple15m <true|false>] [--hasTimeToPeakMinutes <true|false>] [--hasVolume24h <true|false>] [--hasPeakPrice15m <true|false>] [--sortBy <FIELD>] [--sortOrder <asc|desc>] [--limit 20]",
    ].join("\n"),
  );
  process.exit(1);
}

function parseLimitArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseIdArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseSortFieldArg(value: string, key: string): SortField {
  const sortFields: SortField[] = [
    "observedAt",
    "peakFdv24h",
    "maxMultiple15m",
    "timeToPeakMinutes",
  ];

  if (sortFields.includes(value as SortField)) {
    return value as SortField;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseSortOrderArg(value: string, key: string): SortOrder {
  if (value === "asc" || value === "desc") {
    return value;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseBooleanArg(value: string, key: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  printUsageAndExit(`Invalid boolean for ${key}: ${value}`);
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  sortOrder: SortOrder,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return 0;
  return sortOrder === "asc" ? left - right : right - left;
}

function compareObservedAt(
  left: string,
  right: string,
  sortOrder: SortOrder,
): number {
  if (left === right) return 0;
  return sortOrder === "asc"
    ? left.localeCompare(right)
    : right.localeCompare(left);
}

function parseArgs(argv: string[]): MetricsReportArgs {
  const out: Partial<MetricsReportArgs> = {
    sortOrder: "desc",
    limit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = value === "" ? undefined : value;
        break;
      case "--tokenId":
        out.tokenId = parseIdArg(value, key);
        break;
      case "--source":
        out.source = value === "" ? undefined : value;
        break;
      case "--rank":
        out.rank = value === "" ? undefined : value;
        break;
      case "--hasPeakFdv24h":
        out.hasPeakFdv24h = parseBooleanArg(value, key);
        break;
      case "--hasMaxMultiple15m":
        out.hasMaxMultiple15m = parseBooleanArg(value, key);
        break;
      case "--hasTimeToPeakMinutes":
        out.hasTimeToPeakMinutes = parseBooleanArg(value, key);
        break;
      case "--hasVolume24h":
        out.hasVolume24h = parseBooleanArg(value, key);
        break;
      case "--hasPeakPrice15m":
        out.hasPeakPrice15m = parseBooleanArg(value, key);
        break;
      case "--sortBy":
        out.sortBy = parseSortFieldArg(value, key);
        break;
      case "--sortOrder":
        out.sortOrder = parseSortOrderArg(value, key);
        break;
      case "--limit":
        out.limit = parseLimitArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out as MetricsReportArgs;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const metrics = await db.metric.findMany({
    where: {
      ...(args.tokenId !== undefined ? { tokenId: args.tokenId } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.hasPeakFdv24h !== undefined
        ? {
            peakFdv24h: args.hasPeakFdv24h ? { not: null } : null,
          }
        : {}),
      ...(args.hasMaxMultiple15m !== undefined
        ? {
            maxMultiple15m: args.hasMaxMultiple15m ? { not: null } : null,
          }
        : {}),
      ...(args.hasTimeToPeakMinutes !== undefined
        ? {
            timeToPeakMinutes: args.hasTimeToPeakMinutes ? { not: null } : null,
          }
        : {}),
      ...(args.hasVolume24h !== undefined
        ? {
            volume24h: args.hasVolume24h ? { not: null } : null,
          }
        : {}),
      ...(args.hasPeakPrice15m !== undefined
        ? {
            peakPrice15m: args.hasPeakPrice15m ? { not: null } : null,
          }
        : {}),
      ...(args.mint || args.rank
        ? {
            token: {
              ...(args.mint ? { mint: args.mint } : {}),
              ...(args.rank ? { scoreRank: args.rank } : {}),
            },
          }
        : {}),
    },
    orderBy:
      args.sortBy === "observedAt"
        ? [{ observedAt: args.sortOrder }, { id: args.sortOrder }]
        : [{ observedAt: "desc" }, { id: "desc" }],
    ...(args.sortBy === undefined || args.sortBy === "observedAt"
      ? { take: args.limit }
      : {}),
    include: {
      token: {
        select: {
          mint: true,
          name: true,
          symbol: true,
          scoreRank: true,
          scoreTotal: true,
        },
      },
    },
  });

  const items: MetricReportItem[] = metrics.map((metric) => ({
    id: metric.id,
    token: metric.token,
    source: metric.source ?? null,
    observedAt: metric.observedAt.toISOString(),
    peakPrice15m: metric.peakPrice15m,
    maxMultiple15m: metric.maxMultiple15m,
    peakFdv24h: metric.peakFdv24h,
    volume24h: metric.volume24h,
    peakFdv7d: metric.peakFdv7d,
    volume7d: metric.volume7d,
    timeToPeakMinutes: metric.timeToPeakMinutes,
  }));

  if (
    args.sortBy &&
    args.sortBy !== "observedAt"
  ) {
    const sortBy = args.sortBy;

    items.sort((left, right) => {
      const byTarget = compareNullableNumbers(
        left[sortBy],
        right[sortBy],
        args.sortOrder,
      );

      if (byTarget !== 0) {
        return byTarget;
      }

      const byObservedAt = compareObservedAt(
        left.observedAt,
        right.observedAt,
        "desc",
      );

      if (byObservedAt !== 0) {
        return byObservedAt;
      }

      return right.id - left.id;
    });
  }

  const limitedItems = items.slice(0, args.limit);

  console.log(
    JSON.stringify(
      {
        count: limitedItems.length,
        filters: {
          mint: args.mint ?? null,
          tokenId: args.tokenId ?? null,
          source: args.source ?? null,
          rank: args.rank ?? null,
          hasPeakFdv24h: args.hasPeakFdv24h ?? null,
          hasMaxMultiple15m: args.hasMaxMultiple15m ?? null,
          hasTimeToPeakMinutes: args.hasTimeToPeakMinutes ?? null,
          hasVolume24h: args.hasVolume24h ?? null,
          hasPeakPrice15m: args.hasPeakPrice15m ?? null,
          sortBy: args.sortBy ?? null,
          sortOrder: args.sortOrder,
          limit: args.limit,
        },
        items: limitedItems,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
