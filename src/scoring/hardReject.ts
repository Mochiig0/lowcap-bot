const HARD_NG = [
  "rug",
  "honeypot",
  "scam",
  "airdrop guarantee",
  "100x guaranteed",
  "insider only",
  "ponzi",
  "pump and dump",
];

export type HardRejectResult = {
  rejected: boolean;
  reason: string | null;
};

export function checkHardReject(normalizedText: string): HardRejectResult {
  for (const ng of HARD_NG) {
    if (normalizedText.includes(ng)) {
      return { rejected: true, reason: `Matched HARD_NG: ${ng}` };
    }
  }

  return { rejected: false, reason: null };
}
