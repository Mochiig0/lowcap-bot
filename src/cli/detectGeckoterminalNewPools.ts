import "dotenv/config";

import { readFile } from "node:fs/promises";

import {
  importMint,
  type FirstSeenSourceSnapshot,
  type ImportMintResult,
} from "./importMintShared.js";
import {
  buildGeckoterminalNewPoolsDetectorCandidate,
  GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
  GECKOTERMINAL_NEW_POOLS_SOURCE,
} from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import {
  evaluateDetectorCandidate,
  type AcceptResult,
  type DetectorCandidate,
  type RejectResult,
} from "../scoring/evaluateDetectorCandidate.js";

const API_URL =
  "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token,quote_token,dex";

type DetectGeckoterminalNewPoolsArgs = {
  file?: string;
  write: boolean;
};

type LoadedInput = {
  mode: "fetch" | "file";
  file?: string;
  apiUrl?: string;
  raw: unknown;
};

type MinimalHandoffPayload = {
  mint: string;
  source?: string;
  firstSeenSourceSnapshot?: FirstSeenSourceSnapshot;
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
    "pnpm detect:geckoterminal:new-pools [--file <PATH>] [--write]",
    "",
    "Defaults:",
    `- fetches ${API_URL}`,
    "- reads one local raw response instead when --file is set",
    "- reads the first Solana new_pools item only",
    "- builds one source_event_hint candidate",
    "- evaluates the candidate with evaluateDetectorCandidate()",
    "- stays dry-run by default",
    "- writes one accepted { mint, source? } handoff into import:mint only when --write is set",
    "- does not add watch, checkpoint, retry, or scheduler behavior",
  ].join("\n");
}

function parseArgs(argv: string[]): DetectGeckoterminalNewPoolsArgs {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: DetectGeckoterminalNewPoolsArgs = {
    write: false,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    if (key === "--write") {
      out.write = true;
      continue;
    }

    if (key === "--file") {
      const value = normalizedArgv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliUsageError("Missing value for --file");
      }
      out.file = value;
      i += 1;
      continue;
    }

    throw new CliUsageError(`Unknown arg: ${key}`);
  }

  return out;
}

type GeckoterminalOutput = {
  mode: "fetch" | "file";
  file?: string;
  apiUrl?: string;
  dryRun: boolean;
  writeEnabled: boolean;
  source: string;
  eventType: string;
  detectedAt: string;
  mintAddress: string;
  poolCreatedAt?: unknown;
  dexName?: unknown;
  poolAddress?: unknown;
  handoffPayload?: MinimalHandoffPayload;
  importResult?: ImportMintResult;
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

async function readRawFromFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as unknown;
}

async function loadInput(args: DetectGeckoterminalNewPoolsArgs): Promise<LoadedInput> {
  if (args.file) {
    return {
      mode: "file",
      file: args.file,
      raw: await readRawFromFile(args.file),
    };
  }

  return {
    mode: "fetch",
    apiUrl: API_URL,
    raw: await fetchLiveRaw(),
  };
}

function buildMinimalHandoffPayload(
  candidate: DetectorCandidate,
  result: AcceptResult,
): MinimalHandoffPayload {
  if (candidate.candidateKind !== "source_event_hint") {
    throw new Error("GeckoTerminal handoff requires a source_event_hint candidate");
  }

  return {
    mint: result.mint,
    source: result.source,
    firstSeenSourceSnapshot: {
      source: candidate.source,
      detectedAt: candidate.detectedAt,
      poolCreatedAt:
        typeof candidate.payload.poolCreatedAt === "string"
          ? candidate.payload.poolCreatedAt
          : undefined,
      poolAddress:
        typeof candidate.payload.poolAddress === "string"
          ? candidate.payload.poolAddress
          : undefined,
      dexName:
        typeof candidate.payload.dexName === "string"
          ? candidate.payload.dexName
          : undefined,
      baseTokenAddress:
        typeof candidate.payload.baseTokenAddress === "string"
          ? candidate.payload.baseTokenAddress
          : undefined,
      quoteTokenAddress:
        typeof candidate.payload.quoteTokenAddress === "string"
          ? candidate.payload.quoteTokenAddress
          : undefined,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const input = await loadInput(args);

  const detectedAt = new Date().toISOString();
  const candidate = buildGeckoterminalNewPoolsDetectorCandidate(input.raw, detectedAt);
  const detectorResult = evaluateDetectorCandidate(candidate);
  const handoffPayload =
    detectorResult.ok ? buildMinimalHandoffPayload(candidate, detectorResult) : undefined;
  const importResult =
    args.write && handoffPayload ? await importMint(handoffPayload) : undefined;

  const output: GeckoterminalOutput = {
    mode: input.mode,
    file: input.file,
    apiUrl: input.apiUrl,
    dryRun: !args.write,
    writeEnabled: args.write,
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
    detectedAt,
    mintAddress: candidate.payload.mintAddress,
    poolCreatedAt: candidate.payload.poolCreatedAt,
    dexName: candidate.payload.dexName,
    poolAddress: candidate.payload.poolAddress,
    handoffPayload,
    importResult,
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
