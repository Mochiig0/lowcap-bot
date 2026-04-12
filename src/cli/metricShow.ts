import "dotenv/config";

import { db } from "./db.js";

type MetricShowArgs = {
  id: number;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metric:show -- --id <ID>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<MetricShowArgs>,
  key: keyof Pick<MetricShowArgs, "id">,
): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
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

function parseArgs(argv: string[]): MetricShowArgs {
  const out: Partial<MetricShowArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--id":
        out.id = parseIdArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return {
    id: readRequiredArg(out, "id"),
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const metric = await db.metric.findUnique({
    where: {
      id: args.id,
    },
    include: {
      token: {
        select: {
          mint: true,
          name: true,
          symbol: true,
        },
      },
    },
  });

  if (!metric) {
    printUsageAndExit(`Metric not found for id: ${args.id}`);
  }

  console.log(
    JSON.stringify(
      {
        id: metric.id,
        tokenId: metric.tokenId,
        token: metric.token,
        source: metric.source ?? null,
        observedAt: metric.observedAt.toISOString(),
        maxMultiple15m: metric.maxMultiple15m,
        peakFdv24h: metric.peakFdv24h,
        volume24h: metric.volume24h,
        peakFdv7d: metric.peakFdv7d,
        volume7d: metric.volume7d,
        rawJson: metric.rawJson,
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
