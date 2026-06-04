export type BatchSelectableToken = {
  id: number;
  mint: string;
  name: string | null;
  symbol: string | null;
  metricsCount: number;
};

export type BatchSelectorOptions = {
  limit: number;
  pumpOnly: boolean;
  onlyMetricCovered: boolean;
};

export type BatchSelectorResult<Token extends BatchSelectableToken> = {
  incompleteTokens: Token[];
  metricEligibleTokens: Token[];
  pumpEligibleTokens: Token[];
  selectedTokens: Token[];
  selectedIncompleteCount: number;
  skippedCompleteCount: number;
  skippedMetricUncoveredCount: number;
  skippedNonPumpCount: number;
};

export function needsBatchEnrich(token: Pick<BatchSelectableToken, "name" | "symbol">): boolean {
  return token.name === null || token.symbol === null;
}

export function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

export function selectEligibleBatchTokens<Token extends BatchSelectableToken>(
  recentTokens: Token[],
  options: BatchSelectorOptions,
): BatchSelectorResult<Token> {
  const incompleteTokens = recentTokens.filter(needsBatchEnrich);
  const metricEligibleTokens = options.onlyMetricCovered
    ? incompleteTokens.filter((token) => token.metricsCount >= 1)
    : incompleteTokens;
  const pumpEligibleTokens = options.pumpOnly
    ? metricEligibleTokens.filter((token) => isPumpMint(token.mint))
    : metricEligibleTokens;
  const selectedTokens = pumpEligibleTokens.slice(0, options.limit);

  return {
    incompleteTokens,
    metricEligibleTokens,
    pumpEligibleTokens,
    selectedTokens,
    selectedIncompleteCount: selectedTokens.length,
    skippedCompleteCount: recentTokens.length - incompleteTokens.length,
    skippedMetricUncoveredCount: incompleteTokens.length - metricEligibleTokens.length,
    skippedNonPumpCount: metricEligibleTokens.length - pumpEligibleTokens.length,
  };
}
