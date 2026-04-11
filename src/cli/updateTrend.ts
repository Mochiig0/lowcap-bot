import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type WeightedKeyword = {
  keyword: string;
  score: number;
  tag?: string;
};

type TrendDictionary = {
  generatedAt: string;
  ttlHours: number;
  keywords: WeightedKeyword[];
};

type UpdateTrendArgs = {
  keywords: string[];
  ttlHours?: number;
};

const TREND_PATH = resolve(process.cwd(), "data/trend.json");

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      'pnpm trend:update -- --keywords "ai,anime,base,solchat" [--ttlHours 24]',
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

function parseKeywordsArg(value: string): string[] {
  const keywords = Array.from(
    new Set(
      value
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (keywords.length === 0) {
    printUsageAndExit("--keywords must include at least one keyword");
  }

  return keywords;
}

function parseArgs(argv: string[]): UpdateTrendArgs {
  const out: Partial<UpdateTrendArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--keywords":
        out.keywords = parseKeywordsArg(value);
        break;
      case "--ttlHours":
        out.ttlHours = parseOptionalNumberArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (!out.keywords || out.keywords.length === 0) {
    printUsageAndExit("Missing required arg: --keywords");
  }

  return out as UpdateTrendArgs;
}

async function readTrendDictionary(): Promise<TrendDictionary> {
  const raw = await readFile(TREND_PATH, "utf-8");
  return JSON.parse(raw) as TrendDictionary;
}

function buildUpdatedKeywords(
  current: TrendDictionary,
  keywords: string[],
): WeightedKeyword[] {
  const existingByKeyword = new Map(
    current.keywords.map((entry) => [entry.keyword.toLowerCase(), entry] as const),
  );

  return keywords.map((keyword) => {
    const existing = existingByKeyword.get(keyword);
    if (existing) {
      return {
        keyword,
        score: existing.score,
        tag: existing.tag,
      };
    }

    return {
      keyword,
      score: 1,
      tag: "trend",
    };
  });
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const current = await readTrendDictionary();

  const next: TrendDictionary = {
    generatedAt: new Date().toISOString(),
    ttlHours: args.ttlHours ?? current.ttlHours,
    keywords: buildUpdatedKeywords(current, args.keywords),
  };

  await writeFile(TREND_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");

  console.log(
    JSON.stringify(
      {
        path: "data/trend.json",
        generatedAt: next.generatedAt,
        ttlHours: next.ttlHours,
        keywordCount: next.keywords.length,
        keywords: next.keywords.map((entry) => entry.keyword),
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
