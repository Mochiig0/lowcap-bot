import "dotenv/config";

import {
  buildGeckoterminalNewPoolsDetectorCandidate,
  GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
  GECKOTERMINAL_NEW_POOLS_SOURCE,
} from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import {
  evaluateDetectorCandidate,
  type AcceptResult,
  type RejectResult,
} from "../scoring/evaluateDetectorCandidate.js";

const GECKOTERMINAL_API_URL =
  "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token,quote_token,dex";
const DEXSCREENER_API_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

type CompareArgs = {
  timeoutSeconds: number;
  intervalSeconds: number;
};

type DexscreenerTokenProfile = Record<string, unknown> & {
  tokenAddress?: unknown;
  updatedAt?: unknown;
};

type CompareOutput = {
  geckoApiUrl: string;
  dexscreenerApiUrl: string;
  source: string;
  eventType: string;
  mintAddress: string;
  geckoPoolCreatedAt?: unknown;
  geckoDetectedAt: string;
  dexscreenerPollStartedAt: string;
  dexscreenerFirstSeenAt: string | null;
  dexscreenerSourceUpdatedAt: string | null;
  timeoutReached: boolean;
  elapsedMs: number;
  detectorResult: AcceptResult | RejectResult;
};

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm compare:geckoterminal:dexscreener [--timeoutSeconds <N>] [--intervalSeconds <N>]",
    "",
    "Defaults:",
    `- fetches one live GeckoTerminal new_pools page from ${GECKOTERMINAL_API_URL}`,
    `- polls DexScreener token profiles latest v1 from ${DEXSCREENER_API_URL}`,
    "- dry-run and comparison only: no write, watch, checkpoint, or import handoff",
    "- defaults to --timeoutSeconds 300 and --intervalSeconds 15",
  ].join("\n");
}

function parsePositiveIntegerArg(value: string, key: string): number {
  if (value.trim().length === 0) {
    throw new CliUsageError(`Invalid integer for ${key}: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`Invalid integer for ${key}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): CompareArgs {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: CompareArgs = {
    timeoutSeconds: 300,
    intervalSeconds: 15,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];
    if (key === "--help") {
      throw new CliUsageError("");
    }

    const value = normalizedArgv[i + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Unknown arg: ${key}`);
    }

    switch (key) {
      case "--timeoutSeconds":
        out.timeoutSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--intervalSeconds":
        out.intervalSeconds = parsePositiveIntegerArg(value, key);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchGeckoterminalRaw(): Promise<unknown> {
  const response = await fetch(GECKOTERMINAL_API_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GeckoTerminal request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as unknown;
}

async function fetchDexscreenerProfiles(): Promise<DexscreenerTokenProfile[]> {
  const response = await fetch(DEXSCREENER_API_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed: ${response.status} ${response.statusText}`);
  }

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("DexScreener response was not an array");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`DexScreener response item ${index} was not an object`);
    }

    return item as DexscreenerTokenProfile;
  });
}

function findDexscreenerProfile(
  items: DexscreenerTokenProfile[],
  mintAddress: string,
): DexscreenerTokenProfile | undefined {
  return items.find((item) => item.tokenAddress === mintAddress);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const geckoDetectedAt = new Date().toISOString();
  const geckoRaw = await fetchGeckoterminalRaw();
  const candidate = buildGeckoterminalNewPoolsDetectorCandidate(geckoRaw, geckoDetectedAt);
  const detectorResult = evaluateDetectorCandidate(candidate);

  if (!detectorResult.ok) {
    const output: CompareOutput = {
      geckoApiUrl: GECKOTERMINAL_API_URL,
      dexscreenerApiUrl: DEXSCREENER_API_URL,
      source: GECKOTERMINAL_NEW_POOLS_SOURCE,
      eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
      mintAddress: candidate.payload.mintAddress,
      geckoPoolCreatedAt: candidate.payload.poolCreatedAt,
      geckoDetectedAt,
      dexscreenerPollStartedAt: geckoDetectedAt,
      dexscreenerFirstSeenAt: null,
      dexscreenerSourceUpdatedAt: null,
      timeoutReached: false,
      elapsedMs: 0,
      detectorResult,
    };

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const dexscreenerPollStartedAt = new Date().toISOString();
  const startedMs = Date.parse(dexscreenerPollStartedAt);
  const timeoutMs = args.timeoutSeconds * 1000;

  let dexscreenerFirstSeenAt: string | null = null;
  let dexscreenerSourceUpdatedAt: string | null = null;

  while (Date.now() - startedMs <= timeoutMs) {
    const profiles = await fetchDexscreenerProfiles();
    const match = findDexscreenerProfile(profiles, candidate.payload.mintAddress);
    if (match) {
      dexscreenerFirstSeenAt = new Date().toISOString();
      dexscreenerSourceUpdatedAt =
        typeof match.updatedAt === "string" ? match.updatedAt : null;
      break;
    }

    if (Date.now() - startedMs > timeoutMs) {
      break;
    }

    await sleep(args.intervalSeconds * 1000);
  }

  const elapsedMs = Date.now() - startedMs;
  const output: CompareOutput = {
    geckoApiUrl: GECKOTERMINAL_API_URL,
    dexscreenerApiUrl: DEXSCREENER_API_URL,
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
    mintAddress: candidate.payload.mintAddress,
    geckoPoolCreatedAt: candidate.payload.poolCreatedAt,
    geckoDetectedAt,
    dexscreenerPollStartedAt,
    dexscreenerFirstSeenAt,
    dexscreenerSourceUpdatedAt,
    timeoutReached: dexscreenerFirstSeenAt === null,
    elapsedMs,
    detectorResult,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    if (error.message.length > 0) {
      console.error(error.message);
    }
    console.error(getUsageText());
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
