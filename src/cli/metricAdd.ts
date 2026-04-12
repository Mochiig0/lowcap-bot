import "dotenv/config";

import { db } from "./db.js";

type MetricAddArgs = {
  mint: string;
  source?: string;
  launchPrice?: number;
  peakPrice15m?: number;
  peakPrice1h?: number;
  maxMultiple15m?: number;
  maxMultiple1h?: number;
  peakFdv24h?: number;
  volume24h?: number;
  timeToPeakMinutes?: number;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metric:add -- --mint <MINT> [--source <SOURCE>] [--launchPrice <NUM>] [--peakPrice15m <NUM>] [--peakPrice1h <NUM>] [--maxMultiple15m <NUM>] [--maxMultiple1h <NUM>] [--peakFdv24h <NUM>] [--volume24h <NUM>] [--timeToPeakMinutes <NUM>]",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(input: Partial<MetricAddArgs>, key: "mint"): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseOptionalNumberArg(value: string, key: string): number | undefined {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseOptionalStringArg(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseArgs(argv: string[]): MetricAddArgs {
  const out: Partial<MetricAddArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = value;
        break;
      case "--source":
        out.source = parseOptionalStringArg(value);
        break;
      case "--launchPrice":
        out.launchPrice = parseOptionalNumberArg(value, key);
        break;
      case "--peakPrice15m":
        out.peakPrice15m = parseOptionalNumberArg(value, key);
        break;
      case "--peakPrice1h":
        out.peakPrice1h = parseOptionalNumberArg(value, key);
        break;
      case "--maxMultiple15m":
        out.maxMultiple15m = parseOptionalNumberArg(value, key);
        break;
      case "--maxMultiple1h":
        out.maxMultiple1h = parseOptionalNumberArg(value, key);
        break;
      case "--peakFdv24h":
        out.peakFdv24h = parseOptionalNumberArg(value, key);
        break;
      case "--volume24h":
        out.volume24h = parseOptionalNumberArg(value, key);
        break;
      case "--timeToPeakMinutes":
        out.timeToPeakMinutes = parseOptionalNumberArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  const args: MetricAddArgs = {
    mint: readRequiredArg(out, "mint"),
    source: out.source,
    launchPrice: out.launchPrice,
    peakPrice15m: out.peakPrice15m,
    peakPrice1h: out.peakPrice1h,
    maxMultiple15m: out.maxMultiple15m,
    maxMultiple1h: out.maxMultiple1h,
    peakFdv24h: out.peakFdv24h,
    volume24h: out.volume24h,
    timeToPeakMinutes: out.timeToPeakMinutes,
  };

  const hasMetricValue =
    args.launchPrice !== undefined ||
    args.peakPrice15m !== undefined ||
    args.peakPrice1h !== undefined ||
    args.maxMultiple15m !== undefined ||
    args.maxMultiple1h !== undefined ||
    args.peakFdv24h !== undefined ||
    args.volume24h !== undefined ||
    args.timeToPeakMinutes !== undefined;

  if (!hasMetricValue) {
    printUsageAndExit("At least one metric value is required");
  }

  return args;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const token = await db.token.findUnique({
    where: { mint: args.mint },
    select: {
      id: true,
      mint: true,
    },
  });

  if (!token) {
    printUsageAndExit(`Token not found for mint: ${args.mint}`);
  }

  const metric = await db.metric.create({
    data: {
      tokenId: token.id,
      source: args.source ?? "manual",
      launchPrice: args.launchPrice,
      peakPrice15m: args.peakPrice15m,
      peakPrice1h: args.peakPrice1h,
      maxMultiple15m: args.maxMultiple15m,
      maxMultiple1h: args.maxMultiple1h,
      peakFdv24h: args.peakFdv24h,
      volume24h: args.volume24h,
      timeToPeakMinutes: args.timeToPeakMinutes,
    },
    select: {
      id: true,
      source: true,
      observedAt: true,
      launchPrice: true,
      peakPrice15m: true,
      peakPrice1h: true,
      maxMultiple15m: true,
      maxMultiple1h: true,
      peakFdv24h: true,
      volume24h: true,
      timeToPeakMinutes: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        id: metric.id,
        mint: token.mint,
        source: metric.source,
        observedAt: metric.observedAt.toISOString(),
        launchPrice: metric.launchPrice,
        peakPrice15m: metric.peakPrice15m,
        peakPrice1h: metric.peakPrice1h,
        maxMultiple15m: metric.maxMultiple15m,
        maxMultiple1h: metric.maxMultiple1h,
        peakFdv24h: metric.peakFdv24h,
        volume24h: metric.volume24h,
        timeToPeakMinutes: metric.timeToPeakMinutes,
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
