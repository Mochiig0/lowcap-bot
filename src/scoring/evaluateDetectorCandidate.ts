export type DetectorCandidate =
  | {
      candidateKind: "mint_hint";
      mint: string;
      source?: string;
    }
  | {
      candidateKind: "source_event_hint";
      source: string;
      eventType: string;
      detectedAt: string;
      payload: {
        mintAddress: string;
        [key: string]: unknown;
      };
    }
  | {
      candidateKind: "non_mint_text";
      text: string;
      source?: string;
    };

export type AcceptResult = {
  ok: true;
  mint: string;
  source?: string;
};

export type RejectReason =
  | "mint_missing"
  | "mint_unstable"
  | "source_shape_invalid"
  | "not_mint_first_candidate";

export type RejectResult = {
  ok: false;
  reason: RejectReason;
};

const SOLANA_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function normalizeOptionalSource(source: unknown): string | undefined {
  if (typeof source !== "string") return undefined;

  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMint(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStableMint(value: string): boolean {
  return SOLANA_MINT_RE.test(value);
}

function accept(mint: string, source?: unknown): AcceptResult {
  const normalizedSource = normalizeOptionalSource(source);
  return normalizedSource ? { ok: true, mint, source: normalizedSource } : { ok: true, mint };
}

function reject(reason: RejectReason): RejectResult {
  return { ok: false, reason };
}

function evaluateMintCandidate(mint: unknown, source?: unknown): AcceptResult | RejectResult {
  const normalizedMint = normalizeMint(mint);

  if (normalizedMint.length === 0) {
    return reject("mint_missing");
  }

  if (!isStableMint(normalizedMint)) {
    return reject("mint_unstable");
  }

  return accept(normalizedMint, source);
}

export function evaluateDetectorCandidate(
  candidate: DetectorCandidate,
): AcceptResult | RejectResult {
  switch (candidate.candidateKind) {
    case "mint_hint":
      return evaluateMintCandidate(candidate.mint, candidate.source);
    case "source_event_hint": {
      if (
        !isNonEmptyString(candidate.source) ||
        !isNonEmptyString(candidate.eventType) ||
        !isNonEmptyString(candidate.detectedAt) ||
        !candidate.payload ||
        typeof candidate.payload !== "object" ||
        typeof candidate.payload.mintAddress !== "string"
      ) {
        return reject("source_shape_invalid");
      }

      return evaluateMintCandidate(candidate.payload.mintAddress, candidate.source);
    }
    case "non_mint_text":
      return reject("not_mint_first_candidate");
  }
}
