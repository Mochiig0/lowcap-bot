export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTargetText(params: {
  name: string;
  symbol: string;
  description?: string;
}): string {
  return normalizeText(
    [params.name, params.symbol, params.description ?? ""].join(" "),
  );
}
