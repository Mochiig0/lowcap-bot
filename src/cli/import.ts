import "dotenv/config";

import { db } from "../db.js";
import { notifyTelegram } from "../notify/telegram.js";
import { buildTargetText } from "../scoring/normalize.js";
import { checkHardReject } from "../scoring/hardReject.js";
import { scoreText } from "../scoring/score.js";

type ImportArgs = {
  mint: string;
  name: string;
  symbol: string;
  desc?: string;
  dev?: string;
  groupKey?: string;
  groupNote?: string;
  source?: string;
  maxMultiple15m?: number;
  peakFdv24h?: number;
  volume24h?: number;
  peakFdv7d?: number;
  volume7d?: number;
  metricSource?: string;
  observedAt?: Date;
};

type MetricInput = {
  maxMultiple15m?: number;
  peakFdv24h?: number;
  volume24h?: number;
  peakFdv7d?: number;
  volume7d?: number;
  source: string;
  observedAt: Date;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM> [--desc ...] [--dev ...] [--groupKey ...] [--groupNote ...] [--source ...] [--maxMultiple15m ...] [--peakFdv24h ...] [--volume24h ...] [--peakFdv7d ...] [--volume7d ...] [--metricSource ...] [--observedAt ...]",
    ].join("\n"),
  );
  process.exit(1);
}

function parseOptionalNumberArg(value: string, key: string): number | undefined {
  if (value === "") return undefined;

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseOptionalDateArg(value: string, key: string): Date | undefined {
  if (value === "") return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    printUsageAndExit(`Invalid date for ${key}: ${value}`);
  }

  return parsed;
}

function buildMetricInput(args: ImportArgs): MetricInput | null {
  const hasMetricValue =
    args.maxMultiple15m !== undefined ||
    args.peakFdv24h !== undefined ||
    args.volume24h !== undefined ||
    args.peakFdv7d !== undefined ||
    args.volume7d !== undefined ||
    args.metricSource !== undefined ||
    args.observedAt !== undefined;

  if (!hasMetricValue) {
    return null;
  }

  return {
    maxMultiple15m: args.maxMultiple15m,
    peakFdv24h: args.peakFdv24h,
    volume24h: args.volume24h,
    peakFdv7d: args.peakFdv7d,
    volume7d: args.volume7d,
    source: args.metricSource ?? "manual",
    observedAt: args.observedAt ?? new Date(),
  };
}

function parseArgs(argv: string[]): ImportArgs {
  const out: Partial<ImportArgs> = {};

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
      case "--name":
        out.name = value;
        break;
      case "--symbol":
        out.symbol = value;
        break;
      case "--desc":
        out.desc = value;
        break;
      case "--dev":
        out.dev = value;
        break;
      case "--groupKey":
        out.groupKey = value;
        break;
      case "--groupNote":
        out.groupNote = value;
        break;
      case "--source":
        out.source = value;
        break;
      case "--maxMultiple15m":
        out.maxMultiple15m = parseOptionalNumberArg(value, key);
        break;
      case "--peakFdv24h":
        out.peakFdv24h = parseOptionalNumberArg(value, key);
        break;
      case "--volume24h":
        out.volume24h = parseOptionalNumberArg(value, key);
        break;
      case "--peakFdv7d":
        out.peakFdv7d = parseOptionalNumberArg(value, key);
        break;
      case "--volume7d":
        out.volume7d = parseOptionalNumberArg(value, key);
        break;
      case "--metricSource":
        out.metricSource = value === "" ? undefined : value;
        break;
      case "--observedAt":
        out.observedAt = parseOptionalDateArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (!out.mint || !out.name || !out.symbol) {
    printUsageAndExit("--mint, --name and --symbol are required");
  }

  return out as ImportArgs;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const metricInput = buildMetricInput(args);

  const normalizedText = buildTargetText({
    name: args.name,
    symbol: args.symbol,
    description: args.desc,
  });

  const hardReject = checkHardReject(normalizedText);
  const score = await scoreText(normalizedText);

  const devRecord = args.dev
    ? await db.dev.upsert({
        where: { wallet: args.dev },
        update: {},
        create: { wallet: args.dev },
      })
    : null;

  const token = await db.token.upsert({
    where: { mint: args.mint },
    update: {
      name: args.name,
      symbol: args.symbol,
      description: args.desc,
      source: args.source,
      groupKey: args.groupKey,
      groupNote: args.groupNote,
      normalizedText,
      hardRejected: hardReject.rejected,
      hardRejectReason: hardReject.reason,
      scoreTotal: score.total,
      scoreRank: score.rank,
      scoreBreakdown: score.breakdown,
      devId: devRecord?.id,
    },
    create: {
      mint: args.mint,
      name: args.name,
      symbol: args.symbol,
      description: args.desc,
      source: args.source,
      groupKey: args.groupKey,
      groupNote: args.groupNote,
      normalizedText,
      hardRejected: hardReject.rejected,
      hardRejectReason: hardReject.reason,
      scoreTotal: score.total,
      scoreRank: score.rank,
      scoreBreakdown: score.breakdown,
      devId: devRecord?.id,
    },
  });

  if (metricInput) {
    await db.metric.create({
      data: {
        tokenId: token.id,
        maxMultiple15m: metricInput.maxMultiple15m,
        peakFdv24h: metricInput.peakFdv24h,
        volume24h: metricInput.volume24h,
        peakFdv7d: metricInput.peakFdv7d,
        volume7d: metricInput.volume7d,
        source: metricInput.source,
        observedAt: metricInput.observedAt,
      },
    });
  }

  if (score.rank === "S" && !hardReject.rejected) {
    await notifyTelegram(
      [
        "[Lowcap MVP] S-rank token imported",
        `mint: ${token.mint}`,
        `name: ${token.name} (${token.symbol})`,
        `score: ${score.total}`,
        `group: ${token.groupKey ?? "-"}`,
      ].join("\n"),
    );
  }

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        rank: score.rank,
        score: score.total,
        hardRejected: hardReject.rejected,
        hardRejectReason: hardReject.reason,
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
