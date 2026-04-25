export type GeckoTokenWriteStatus = "ok" | "error" | "rate_limited";

export type GeckoTokenWriteInput = {
  mint: string;
  write: boolean;
  notify?: false;
  captureFile?: string | null;
};

export type GeckoTokenWriteResult = {
  mint: string;
  status: GeckoTokenWriteStatus;
  name: string | null;
  symbol: string | null;
  metadataStatus: string | null;
  scoreRank: string | null;
  scoreTotal: number | null;
  hardRejected: boolean | null;
  enrichWritten: boolean;
  rescoreWritten: boolean;
  contextWritten: boolean;
  metaplexContextWritten: boolean;
  notifyWouldSend: boolean;
  notifySent: boolean;
  rateLimited: boolean;
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
    name: null,
    symbol: null,
    metadataStatus: null,
    scoreRank: null,
    scoreTotal: null,
    hardRejected: null,
    enrichWritten: false,
    rescoreWritten: false,
    contextWritten: false,
    metaplexContextWritten: false,
    notifyWouldSend: false,
    notifySent: false,
    rateLimited: false,
    error: GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  };
}

export async function runGeckoTokenWriteForMint(
  input: GeckoTokenWriteInput,
): Promise<GeckoTokenWriteResult> {
  return buildUnsupportedGeckoTokenWriteResult(input);
}
