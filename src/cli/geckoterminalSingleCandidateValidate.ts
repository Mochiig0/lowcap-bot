import { readFile } from "node:fs/promises";

const KNOWN_RED_COMMAND_KINDS = new Set([
  "gecko_enrich_rescore_single_mint",
  "gecko_metric_snapshot_single_mint",
  "tmux_metric_single_mint",
]);

const RED_APPROVAL_STAGES_BY_KIND = new Map<string, string>([
  ["gecko_enrich_rescore_single_mint", "mint_only_without_metrics"],
  ["gecko_metric_snapshot_single_mint", "partial_without_metrics"],
  ["tmux_metric_single_mint", "partial_with_one_metric"],
]);

const STOP_STAGES = new Set([
  "guard_mismatch",
  "invalid_args",
  "manual_review_required",
  "missing_token",
  "missing_mint_arg",
]);

const REQUIRED_STOP_CONDITION_CODES = [
  "guard_mismatch",
  "invalid_args",
  "written_count_gt_1",
  "error_count_gt_0",
  "rawjson_output_risk",
  "secret_output_risk",
  "telegram_expansion_risk",
  "systemd_expansion_risk",
  "scheduler_queue_expansion_risk",
  "unbounded_watch_expansion_risk",
  "default_checkpoint_expansion_risk",
  "git_dirty",
] as const;

const SECRET_MARKERS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "DATABASE_URL",
] as const;

type Checks = {
  hasNextRedCommand: boolean;
  requiresHumanApproval: boolean;
  executorIsHuman: boolean;
  plannerWillNotExecute: boolean;
  sideEffectWithinBounds: boolean;
  stopConditionCodesPresent: boolean;
  rawJsonFree: boolean;
};

type ValidationOutput = {
  status: "ok" | "stop";
  reason: string;
  mint: string | null;
  currentStage: string | null;
  nextRedCommandKind: string | null;
  approvalReady: boolean;
  canProceedToHumanGate: boolean;
  checks: Checks;
  nextRedCommand: string | null;
};

type Args = {
  plannerJson?: string;
  error?: string;
};

type ScanResult = {
  hasRawJsonKey: boolean;
  hasSecretMarker: boolean;
};

type LoadResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      output: ValidationOutput;
    };

function parseArgs(argv: string[]): Args {
  const out: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--") continue;

    if (key !== "--plannerJson") {
      return { error: `Unknown option: ${key}` };
    }

    if (value === undefined || value.startsWith("--") || value === "") {
      return { error: "Missing value for --plannerJson" };
    }

    if (out.plannerJson !== undefined) {
      return { error: "Duplicate --plannerJson" };
    }

    out.plannerJson = value;
    i += 1;
  }

  return out;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scanForUnsafePayload(value: unknown): ScanResult {
  const result: ScanResult = {
    hasRawJsonKey: false,
    hasSecretMarker: false,
  };

  function visit(item: unknown): void {
    if (typeof item === "string") {
      if (
        SECRET_MARKERS.some((marker) => item.includes(marker)) ||
        item.toLowerCase().includes("raw payload")
      ) {
        result.hasSecretMarker = true;
      }
      return;
    }

    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }

    if (!isRecord(item)) {
      return;
    }

    for (const [key, child] of Object.entries(item)) {
      if (key === "rawJson") {
        result.hasRawJsonKey = true;
      }
      visit(child);
    }
  }

  visit(value);
  return result;
}

function emptyChecks(): Checks {
  return {
    hasNextRedCommand: false,
    requiresHumanApproval: false,
    executorIsHuman: false,
    plannerWillNotExecute: false,
    sideEffectWithinBounds: false,
    stopConditionCodesPresent: false,
    rawJsonFree: false,
  };
}

function stopOutput(reason: string): ValidationOutput {
  return {
    status: "stop",
    reason,
    mint: null,
    currentStage: null,
    nextRedCommandKind: null,
    approvalReady: false,
    canProceedToHumanGate: false,
    checks: emptyChecks(),
    nextRedCommand: null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function sideEffectWithinBounds(
  kind: string | null,
  spec: unknown,
): boolean {
  if (!isRecord(spec)) {
    return false;
  }

  const metricWriteMax = spec.metricWriteMax;
  const tokenWrite = spec.tokenWrite;
  const tokenWriteMax = spec.tokenWriteMax;
  const telegramSend = spec.telegramSend;
  const tmux = spec.tmux;
  const tmuxSession = spec.tmuxSession;
  const checkpointWrite = spec.checkpointWrite;
  const systemd = spec.systemd;
  const multiMint = spec.multiMint;

  if (
    typeof metricWriteMax !== "number" ||
    typeof tokenWrite !== "boolean" ||
    typeof tokenWriteMax !== "number" ||
    typeof telegramSend !== "boolean" ||
    typeof tmux !== "boolean" ||
    typeof checkpointWrite !== "boolean" ||
    typeof systemd !== "boolean" ||
    typeof multiMint !== "boolean"
  ) {
    return false;
  }

  if (
    metricWriteMax > 1 ||
    tokenWriteMax > 1 ||
    telegramSend ||
    systemd ||
    multiMint ||
    checkpointWrite
  ) {
    return false;
  }

  if (kind === "gecko_enrich_rescore_single_mint") {
    return (
      metricWriteMax === 0 &&
      tokenWrite &&
      tokenWriteMax === 1 &&
      !tmux &&
      tmuxSession === null
    );
  }

  if (kind === "gecko_metric_snapshot_single_mint") {
    return (
      metricWriteMax === 1 &&
      !tokenWrite &&
      tokenWriteMax === 0 &&
      !tmux &&
      tmuxSession === null
    );
  }

  if (kind === "tmux_metric_single_mint") {
    return (
      metricWriteMax === 1 &&
      !tokenWrite &&
      tokenWriteMax === 0 &&
      tmux &&
      tmuxSession === "lowcap-gecko-metric-single"
    );
  }

  return false;
}

function hasRequiredStopConditionCodes(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  const codes = new Set(
    value.filter((item): item is string => typeof item === "string"),
  );
  return REQUIRED_STOP_CONDITION_CODES.every((code) => codes.has(code));
}

function validatePlannerOutput(plannerOutput: unknown): ValidationOutput {
  if (!isRecord(plannerOutput)) {
    return stopOutput("invalid_args: planner JSON must be an object");
  }

  const scan = scanForUnsafePayload(plannerOutput);
  const mint = stringOrNull(plannerOutput.mint);
  const currentStage = stringOrNull(plannerOutput.currentStage);
  const nextRedCommandKind = stringOrNull(plannerOutput.nextRedCommandKind);
  const nextRedCommand = stringOrNull(plannerOutput.nextRedCommand);
  const safeToEchoCommand = !scan.hasRawJsonKey && !scan.hasSecretMarker;
  const hasNextRedCommand = nextRedCommand !== null && nextRedCommand.trim() !== "";
  const kindIsKnown =
    nextRedCommandKind !== null && KNOWN_RED_COMMAND_KINDS.has(nextRedCommandKind);
  const expectedStage =
    nextRedCommandKind === null
      ? undefined
      : RED_APPROVAL_STAGES_BY_KIND.get(nextRedCommandKind);
  const stageAllowsApproval =
    expectedStage !== undefined && currentStage === expectedStage;
  const rawJsonFree =
    plannerOutput.rawJsonFreeRequired === true &&
    !scan.hasRawJsonKey &&
    !scan.hasSecretMarker;

  const checks: Checks = {
    hasNextRedCommand,
    requiresHumanApproval: plannerOutput.requiresHumanApproval === true,
    executorIsHuman: plannerOutput.executor === "human",
    plannerWillNotExecute: plannerOutput.willExecute === false,
    sideEffectWithinBounds: sideEffectWithinBounds(
      nextRedCommandKind,
      plannerOutput.sideEffectUpperBoundSpec,
    ),
    stopConditionCodesPresent: hasRequiredStopConditionCodes(
      plannerOutput.stopConditionCodes,
    ),
    rawJsonFree,
  };

  const reasons: string[] = [];

  if (plannerOutput.status !== "ok") {
    reasons.push("planner status is not ok");
  }
  if (!hasNextRedCommand) {
    reasons.push("nextRedCommand is missing");
  }
  if (currentStage !== null && STOP_STAGES.has(currentStage)) {
    reasons.push(`currentStage=${currentStage} must stop`);
  }
  if (!stageAllowsApproval) {
    reasons.push("currentStage is not valid for the Red command kind");
  }
  if (!kindIsKnown) {
    reasons.push("nextRedCommandKind is unknown or missing");
  }
  if (!checks.requiresHumanApproval) {
    reasons.push("requiresHumanApproval is not true");
  }
  if (!checks.executorIsHuman) {
    reasons.push("executor is not human");
  }
  if (!checks.plannerWillNotExecute) {
    reasons.push("willExecute is not false");
  }
  if (!checks.sideEffectWithinBounds) {
    reasons.push("sideEffectUpperBoundSpec is outside validator bounds");
  }
  if (!checks.stopConditionCodesPresent) {
    reasons.push("required stopConditionCodes are missing");
  }
  if (scan.hasRawJsonKey) {
    reasons.push("rawJson key present");
  }
  if (scan.hasSecretMarker) {
    reasons.push("secret/env marker present");
  }
  if (plannerOutput.rawJsonFreeRequired !== true) {
    reasons.push("rawJsonFreeRequired is not true");
  }

  const approvalReady =
    reasons.length === 0 &&
    Object.values(checks).every((check) => check === true);

  return {
    status: approvalReady ? "ok" : "stop",
    reason: approvalReady
      ? "planner output is ready for the human Red approval gate"
      : reasons.join("; "),
    mint,
    currentStage,
    nextRedCommandKind,
    approvalReady,
    canProceedToHumanGate: approvalReady,
    checks,
    nextRedCommand: safeToEchoCommand ? nextRedCommand : null,
  };
}

async function loadPlannerJson(args: Args): Promise<LoadResult> {
  if (args.error) {
    return { ok: false, output: stopOutput(`invalid_args: ${args.error}`) };
  }

  const stdinText = (await readStdin()).trim();
  const hasStdin = stdinText.length > 0;
  const hasFile = args.plannerJson !== undefined;

  if (hasFile && hasStdin) {
    return {
      ok: false,
      output: stopOutput("invalid_args: use either --plannerJson or stdin, not both"),
    };
  }

  if (!hasFile && !hasStdin) {
    return {
      ok: false,
      output: stopOutput("invalid_args: provide --plannerJson <FILE> or stdin JSON"),
    };
  }

  const text = hasFile ? await readFile(args.plannerJson as string, "utf-8") : stdinText;

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      output: stopOutput("invalid_args: planner JSON parse failed"),
    };
  }
}

async function main(): Promise<void> {
  const loaded = await loadPlannerJson(parseArgs(process.argv.slice(2)));
  const output = loaded.ok ? validatePlannerOutput(loaded.value) : loaded.output;

  console.log(JSON.stringify(output, null, 2));
  if (output.status !== "ok") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const output = stopOutput(`invalid_args: ${message}`);
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = 1;
});
