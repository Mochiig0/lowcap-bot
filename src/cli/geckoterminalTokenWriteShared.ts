export type GeckoTokenWriteStatus = "ok" | "error" | "rate_limited";

export type GeckoTokenWriteRateLimitScope =
  | "geckoterminal"
  | "metaplex"
  | null;

export type GeckoTokenWriteDeps = {
  db?: unknown;
  now?: () => Date;
  fetchTokenSnapshot?: (mint: string) => Promise<unknown>;
  fetchMetaplexContext?: (mint: string) => Promise<unknown>;
  logger?: Pick<Console, "error">;
};

export type GeckoTokenWriteInput = {
  mint: string;
  write: boolean;
  notify?: false;
  captureFile?: string | null;
};

export type GeckoTokenWriteSummary = {
  enrichWritten: boolean;
  rescoreWritten: boolean;
  contextWritten: boolean;
  metaplexContextWritten: boolean;
  notifySent: boolean;
};

export type GeckoTokenWriteResult = {
  mint: string;
  status: GeckoTokenWriteStatus;
  selectedReason: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string | null;
  scoreRank: string | null;
  scoreTotal: number | null;
  hardRejected: boolean | null;
  contextWouldWrite: boolean;
  metaplexContextWouldWrite: boolean;
  enrichWritten: boolean;
  rescoreWritten: boolean;
  contextWritten: boolean;
  metaplexContextWritten: boolean;
  writeSummary: GeckoTokenWriteSummary;
  notifyEligibleBefore: boolean | null;
  notifyEligibleAfter: boolean | null;
  notifyWouldSend: boolean;
  notifySent: boolean;
  rateLimited: boolean;
  rateLimitScope: GeckoTokenWriteRateLimitScope;
  metaplexErrorKind: string | null;
  error?: string;
};

export const GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED =
  "not_implemented";

export function buildUnsupportedGeckoTokenWriteResult(
  input: GeckoTokenWriteInput,
): GeckoTokenWriteResult {
  return {
    mint: input.mint,
    status: "error",
    selectedReason: null,
    name: null,
    symbol: null,
    metadataStatus: null,
    scoreRank: null,
    scoreTotal: null,
    hardRejected: null,
    contextWouldWrite: false,
    metaplexContextWouldWrite: false,
    enrichWritten: false,
    rescoreWritten: false,
    contextWritten: false,
    metaplexContextWritten: false,
    writeSummary: {
      enrichWritten: false,
      rescoreWritten: false,
      contextWritten: false,
      metaplexContextWritten: false,
      notifySent: false,
    },
    notifyEligibleBefore: null,
    notifyEligibleAfter: null,
    notifyWouldSend: false,
    notifySent: false,
    rateLimited: false,
    rateLimitScope: null,
    metaplexErrorKind: null,
    error: GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  };
}

export async function runGeckoTokenWriteForMint(
  input: GeckoTokenWriteInput,
  deps: GeckoTokenWriteDeps = {},
): Promise<GeckoTokenWriteResult> {
  void deps;
  return buildUnsupportedGeckoTokenWriteResult(input);
}
