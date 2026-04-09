const lines = [
  "Lowcap Bot CLI Hub",
  "",
  "Available commands:",
  "",
  "pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM>",
  "  Import one token candidate, score it, and save Token/Dev data.",
  '  Example: pnpm import -- --mint TESTMINT --name "basic token" --symbol BTK',
  "",
  'pnpm trend:update -- --keywords "ai,anime,base" [--ttlHours 24]',
  "  Refresh trend keywords used by trend scoring.",
  '  Example: pnpm trend:update -- --keywords "ai,anime,base" --ttlHours 24',
  "",
  "pnpm metrics:report -- [--mint <MINT>] [--limit 20]",
  "  Show recent saved Metric rows as JSON.",
  "  Example: pnpm metrics:report -- --mint TESTMINT --limit 5",
  "",
  "pnpm smoke",
  "  Run a lightweight operational check for the core MVP flows.",
  "  Example: pnpm smoke",
];

console.log(lines.join("\n"));
