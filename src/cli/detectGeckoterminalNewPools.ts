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

const API_URL =
  "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token,quote_token,dex";

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm detect:geckoterminal:new-pools",
    "",
    "Defaults:",
    `- fetches ${API_URL}`,
    "- reads the first Solana new_pools item only",
    "- builds one source_event_hint candidate",
    "- evaluates the candidate with evaluateDetectorCandidate()",
    "- dry-run only: no write, watch, checkpoint, or import handoff",
  ].join("\n");
}

function parseArgs(argv: string[]): void {
  if (argv.length === 0) {
    return;
  }

  if (argv.length === 1 && argv[0] === "--help") {
    throw new CliUsageError("");
  }

  throw new CliUsageError(`Unknown arg: ${argv[0]}`);
}

type GeckoterminalOutput = {
  apiUrl: string;
  source: string;
  eventType: string;
  detectedAt: string;
  mintAddress: string;
  poolCreatedAt?: unknown;
  dexName?: unknown;
  poolAddress?: unknown;
  detectorResult: AcceptResult | RejectResult;
};

async function fetchLiveRaw(): Promise<unknown> {
  const response = await fetch(API_URL, {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GeckoTerminal request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as unknown;
}

async function main(): Promise<void> {
  parseArgs(process.argv.slice(2));

  const detectedAt = new Date().toISOString();
  const raw = await fetchLiveRaw();
  const candidate = buildGeckoterminalNewPoolsDetectorCandidate(raw, detectedAt);
  const detectorResult = evaluateDetectorCandidate(candidate);

  const output: GeckoterminalOutput = {
    apiUrl: API_URL,
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
    detectedAt,
    mintAddress: candidate.payload.mintAddress,
    poolCreatedAt: candidate.payload.poolCreatedAt,
    dexName: candidate.payload.dexName,
    poolAddress: candidate.payload.poolAddress,
    detectorResult,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    const usage = getUsageText();
    if (error.message.length > 0) {
      console.error(error.message);
    }
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
