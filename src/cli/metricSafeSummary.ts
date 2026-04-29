export type SafeMetricSummary = {
  priceUsdPresent: boolean;
  fdvUsdPresent: boolean;
  reserveUsdPresent: boolean;
  topPoolPresent: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPresentValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function hasAnyPresentValue(
  value: Record<string, unknown> | null,
  keys: string[],
): boolean {
  if (value === null) return false;
  return keys.some((key) => hasPresentValue(value[key]));
}

function hasTopPool(rawJson: unknown): boolean {
  if (!isRecord(rawJson)) return false;

  const topPool = readRecord(rawJson, "topPool");
  if (
    topPool &&
    (
      hasPresentValue(topPool.address) ||
      hasPresentValue(topPool.id) ||
      hasPresentValue(topPool.poolId) ||
      hasPresentValue(topPool.poolAddress) ||
      Object.keys(topPool).length > 0
    )
  ) {
    return true;
  }

  if (typeof rawJson.topPoolCount === "number" && rawJson.topPoolCount > 0) {
    return true;
  }

  return hasPresentValue(rawJson.topPoolId) ||
    hasPresentValue(rawJson.topPoolAddress) ||
    hasPresentValue(rawJson.poolId) ||
    hasPresentValue(rawJson.poolAddress);
}

export function buildSafeMetricSummary(rawJson: unknown): SafeMetricSummary {
  if (!isRecord(rawJson)) {
    return {
      priceUsdPresent: false,
      fdvUsdPresent: false,
      reserveUsdPresent: false,
      topPoolPresent: false,
    };
  }

  const token = readRecord(rawJson, "token");
  const topPool = readRecord(rawJson, "topPool");

  return {
    priceUsdPresent:
      hasAnyPresentValue(rawJson, ["priceUsd", "price_usd", "tokenPriceUsd", "token_price_usd"]) ||
      hasAnyPresentValue(token, ["priceUsd", "price_usd"]) ||
      hasAnyPresentValue(topPool, ["tokenPriceUsd", "token_price_usd", "priceUsd", "price_usd"]),
    fdvUsdPresent:
      hasAnyPresentValue(rawJson, ["fdvUsd", "fdv_usd"]) ||
      hasAnyPresentValue(token, ["fdvUsd", "fdv_usd"]) ||
      hasAnyPresentValue(topPool, ["fdvUsd", "fdv_usd"]),
    reserveUsdPresent:
      hasAnyPresentValue(rawJson, ["reserveUsd", "reserve_usd", "reserveInUsd", "reserve_in_usd", "totalReserveInUsd", "total_reserve_in_usd"]) ||
      hasAnyPresentValue(token, ["totalReserveInUsd", "total_reserve_in_usd", "reserveUsd", "reserve_usd"]) ||
      hasAnyPresentValue(topPool, ["reserveInUsd", "reserve_in_usd", "reserveUsd", "reserve_usd"]),
    topPoolPresent: hasTopPool(rawJson),
  };
}
