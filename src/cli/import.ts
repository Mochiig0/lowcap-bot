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
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM> [--desc ...] [--dev ...] [--groupKey ...] [--groupNote ...] [--source ...]",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): ImportArgs {
  const out: Partial<ImportArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (!value || value.startsWith("--")) {
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
