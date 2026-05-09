const ALLOWED_INTENTS = new Set([
  "enrich_rescore",
  "first_metric_snapshot",
  "second_metric_snapshot",
]);
const ALLOWED_METADATA_STATUSES = new Set(["mint_only", "partial"]);
const ALLOWED_STAGES = new Set([
  "mint_only_without_metrics",
  "partial_without_metrics",
  "partial_with_one_metric",
]);

type Intent =
  | "enrich_rescore"
  | "first_metric_snapshot"
  | "second_metric_snapshot";

type IntentConfig = {
  expectedMetricsCount: number;
  expectedMetadataStatus: "mint_only" | "partial";
  expectedStage:
    | "mint_only_without_metrics"
    | "partial_without_metrics"
    | "partial_with_one_metric";
  sideEffectUpperBoundSpec: SideEffectUpperBoundSpec;
};

type Args = {
  mint?: string;
  intent?: Intent;
  expectedMetricsCount?: number;
  expectedMetadataStatus?: string;
  expectedStage?: string;
  error?: string;
};

type ResolvedArgs = {
  mint?: string;
  intent: Intent | null;
  expectedMetricsCount?: number;
  expectedMetadataStatus?: string;
  expectedStage?: string;
};

type SideEffectUpperBoundSpec = {
  metricWriteMax: number;
  tokenWrite: boolean;
  tokenWriteMax: number;
  telegramSend: boolean;
  tmux: boolean;
  tmuxSession: string | null;
  checkpointWrite: boolean;
  systemd: boolean;
  multiMint: boolean;
};

type Commands = {
  baseline: string[];
  guide: string;
  planner: string;
  validator: string;
  redExecution: {
    placeholder: true;
    exactCommand: null;
  };
  reportConfirmation: string[];
};

type PlanOutput = {
  status: "ok" | "stop";
  reason: string;
  mode: "non_executor_wrapper";
  willExecute: false;
  executor: "human";
  mint: string | null;
  intent: Intent | null;
  operatorMode: "human_gated";
  expectedMetricsCount: number | null;
  expectedMetadataStatus: string | null;
  expectedStage: string | null;
  currentStage: null;
  nextStage: null;
  stageOrder: string[];
  commands: Commands | null;
  approvalRequest: {
    requiredFields: string[];
  };
  sideEffectUpperBoundSpec: SideEffectUpperBoundSpec;
  stopConditionCodes: string[];
  forbidden: string[];
  rawJsonFreeRequired: true;
};

const BASE_SIDE_EFFECT_SPEC: SideEffectUpperBoundSpec = {
  metricWriteMax: 0,
  tokenWrite: false,
  tokenWriteMax: 0,
  telegramSend: false,
  tmux: false,
  tmuxSession: null,
  checkpointWrite: false,
  systemd: false,
  multiMint: false,
};

const INTENT_CONFIG: Record<Intent, IntentConfig> = {
  enrich_rescore: {
    expectedMetricsCount: 0,
    expectedMetadataStatus: "mint_only",
    expectedStage: "mint_only_without_metrics",
    sideEffectUpperBoundSpec: {
      ...BASE_SIDE_EFFECT_SPEC,
      tokenWrite: true,
      tokenWriteMax: 1,
    },
  },
  first_metric_snapshot: {
    expectedMetricsCount: 0,
    expectedMetadataStatus: "partial",
    expectedStage: "partial_without_metrics",
    sideEffectUpperBoundSpec: {
      ...BASE_SIDE_EFFECT_SPEC,
      metricWriteMax: 1,
    },
  },
  second_metric_snapshot: {
    expectedMetricsCount: 1,
    expectedMetadataStatus: "partial",
    expectedStage: "partial_with_one_metric",
    sideEffectUpperBoundSpec: {
      ...BASE_SIDE_EFFECT_SPEC,
      metricWriteMax: 1,
      tmux: true,
      tmuxSession: "lowcap-gecko-metric-single",
    },
  },
};

const STAGE_ORDER = [
  "baseline",
  "guide",
  "planner",
  "validator",
  "human_gate",
  "red_execution",
  "report_confirmation",
  "docs_record",
];

const APPROVAL_REQUEST_REQUIRED_FIELDS = [
  "repo_state",
  "baseline",
  "guide_result",
  "planner_result",
  "validator_result",
  "exact_red_command",
  "side_effect_upper_bound",
  "stop_conditions",
  "rawjson_free_confirmation",
  "not_executed_list",
];

const STOP_CONDITION_CODES = [
  "git_dirty",
  "head_mismatch",
  "origin_mismatch",
  "mint_missing_or_ambiguous",
  "intent_missing_or_invalid",
  "guard_mismatch",
  "metadata_status_mismatch",
  "metrics_count_mismatch",
  "expected_stage_mismatch",
  "planner_status_not_ok",
  "validator_not_approval_ready",
  "next_red_command_missing",
  "next_red_command_kind_mismatch",
  "side_effect_bound_exceeded",
  "selected_count_gt_1",
  "written_count_gt_1",
  "error_count_gt_0",
  "rawjson_output_risk",
  "secret_output_risk",
  "telegram_expansion_risk",
  "ops_expansion_risk",
  "systemd_expansion_risk",
  "scheduler_queue_expansion_risk",
  "unbounded_watch_expansion_risk",
  "default_checkpoint_expansion_risk",
  "multi_mint_expansion_risk",
];

const FORBIDDEN = [
  "existing CLI execution by wrapper",
  "planner execution by wrapper",
  "validator execution by wrapper",
  "nextRedCommand execution",
  "Red command execution",
  "--write execution",
  "--watch execution",
  "tmux start",
  "Telegram send",
  "systemd",
  "scheduler",
  "queue",
  "unbounded watch",
  "default checkpoint",
  "multi-mint",
  "silent retry",
];

function parseArgs(argv: string[]): Args {
  const out: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--") continue;

    if (
      key !== "--mint" &&
      key !== "--intent" &&
      key !== "--expectedMetricsCount" &&
      key !== "--expectedMetadataStatus" &&
      key !== "--expectedStage"
    ) {
      return { error: `invalid_args: unknown option ${key}` };
    }

    if (value === undefined || value === "" || value.startsWith("--")) {
      return { error: `invalid_args: missing value for ${key}` };
    }

    if (key === "--mint") {
      if (out.mint !== undefined) {
        return { error: "invalid_args: duplicate --mint" };
      }
      out.mint = value;
      i += 1;
      continue;
    }

    if (key === "--intent") {
      if (out.intent !== undefined) {
        return { error: "invalid_args: duplicate --intent" };
      }
      if (!ALLOWED_INTENTS.has(value)) {
        return { error: `invalid_args: invalid intent ${value}` };
      }
      out.intent = value as Intent;
      i += 1;
      continue;
    }

    if (key === "--expectedMetricsCount") {
      if (out.expectedMetricsCount !== undefined) {
        return { error: "invalid_args: duplicate --expectedMetricsCount" };
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return { error: `invalid_args: invalid expectedMetricsCount ${value}` };
      }
      out.expectedMetricsCount = parsed;
      i += 1;
      continue;
    }

    if (key === "--expectedMetadataStatus") {
      if (out.expectedMetadataStatus !== undefined) {
        return { error: "invalid_args: duplicate --expectedMetadataStatus" };
      }
      if (!ALLOWED_METADATA_STATUSES.has(value)) {
        return { error: `invalid_args: invalid expectedMetadataStatus ${value}` };
      }
      out.expectedMetadataStatus = value;
      i += 1;
      continue;
    }

    if (out.expectedStage !== undefined) {
      return { error: "invalid_args: duplicate --expectedStage" };
    }
    if (!ALLOWED_STAGES.has(value)) {
      return { error: `invalid_args: invalid expectedStage ${value}` };
    }
    out.expectedStage = value;
    i += 1;
  }

  return out;
}

function applyIntentDefaults(
  args: Args,
): { args: ResolvedArgs; error?: string } {
  if (args.intent === undefined) {
    return {
      args: {
        ...args,
        intent: null,
      },
      error: "missing intent: provide --intent <INTENT>",
    };
  }

  const config = INTENT_CONFIG[args.intent];

  if (
    args.expectedMetricsCount !== undefined &&
    args.expectedMetricsCount !== config.expectedMetricsCount
  ) {
    return {
      args: { ...args, intent: args.intent },
      error: `intent conflict: ${args.intent} expects expectedMetricsCount ${config.expectedMetricsCount}, received ${args.expectedMetricsCount}`,
    };
  }

  if (
    args.expectedMetadataStatus !== undefined &&
    args.expectedMetadataStatus !== config.expectedMetadataStatus
  ) {
    return {
      args: { ...args, intent: args.intent },
      error: `intent conflict: ${args.intent} expects expectedMetadataStatus ${config.expectedMetadataStatus}, received ${args.expectedMetadataStatus}`,
    };
  }

  if (
    args.expectedStage !== undefined &&
    args.expectedStage !== config.expectedStage
  ) {
    return {
      args: { ...args, intent: args.intent },
      error: `intent conflict: ${args.intent} expects expectedStage ${config.expectedStage}, received ${args.expectedStage}`,
    };
  }

  return {
    args: {
      ...args,
      intent: args.intent,
      expectedMetricsCount:
        args.expectedMetricsCount ?? config.expectedMetricsCount,
      expectedMetadataStatus:
        args.expectedMetadataStatus ?? config.expectedMetadataStatus,
      expectedStage: args.expectedStage ?? config.expectedStage,
    },
  };
}

function plannerCommand(args: ResolvedArgs & { mint: string }): string {
  return [
    "pnpm -s ops:gecko:single-candidate:plan --",
    "--mint",
    args.mint,
    "--expectedMetricsCount",
    String(args.expectedMetricsCount),
    "--expectedMetadataStatus",
    String(args.expectedMetadataStatus),
    "--expectedStage",
    String(args.expectedStage),
    "> /tmp/lowcap-planner.json",
  ].join(" ");
}

function buildCommands(args: ResolvedArgs & { mint: string; intent: Intent }): Commands {
  return {
    baseline: [
      `pnpm -s token:compare -- --mint ${args.mint}`,
      `pnpm -s token:show -- --mint ${args.mint}`,
      `pnpm -s metrics:report -- --mint ${args.mint} --limit 2`,
    ],
    guide: `pnpm -s ops:gecko:bounded-flow:guide -- --mint ${args.mint} --intent ${args.intent}`,
    planner: plannerCommand(args),
    validator:
      "pnpm -s ops:gecko:single-candidate:validate -- --plannerJson /tmp/lowcap-planner.json > /tmp/lowcap-validator.json",
    redExecution: {
      placeholder: true,
      exactCommand: null,
    },
    reportConfirmation: [
      `pnpm -s metrics:report -- --mint ${args.mint} --limit 2`,
      `pnpm -s token:compare -- --mint ${args.mint}`,
      `pnpm -s token:show -- --mint ${args.mint}`,
    ],
  };
}

function outputBase(
  status: "ok" | "stop",
  reason: string,
  args: ResolvedArgs,
): PlanOutput {
  const spec =
    args.intent === null
      ? BASE_SIDE_EFFECT_SPEC
      : INTENT_CONFIG[args.intent].sideEffectUpperBoundSpec;

  return {
    status,
    reason,
    mode: "non_executor_wrapper",
    willExecute: false,
    executor: "human",
    mint: args.mint ?? null,
    intent: args.intent,
    operatorMode: "human_gated",
    expectedMetricsCount: args.expectedMetricsCount ?? null,
    expectedMetadataStatus: args.expectedMetadataStatus ?? null,
    expectedStage: args.expectedStage ?? null,
    currentStage: null,
    nextStage: null,
    stageOrder: STAGE_ORDER,
    commands: null,
    approvalRequest: {
      requiredFields: APPROVAL_REQUEST_REQUIRED_FIELDS,
    },
    sideEffectUpperBoundSpec: spec,
    stopConditionCodes: STOP_CONDITION_CODES,
    forbidden: FORBIDDEN,
    rawJsonFreeRequired: true,
  };
}

function buildOutput(args: Args): PlanOutput {
  const resolved = applyIntentDefaults(args);

  if (args.error !== undefined) {
    return outputBase("stop", args.error, {
      ...resolved.args,
      mint: args.mint,
    });
  }

  if (resolved.error !== undefined) {
    return outputBase("stop", resolved.error, resolved.args);
  }

  if (resolved.args.mint === undefined) {
    return outputBase(
      "stop",
      "missing mint: provide --mint <MINT>",
      resolved.args,
    );
  }

  if (resolved.args.intent === null) {
    return outputBase("stop", "missing intent: provide --intent <INTENT>", {
      ...resolved.args,
      mint: resolved.args.mint,
    });
  }

  return {
    ...outputBase(
      "ok",
      "bounded flow non-executor plan generated; no commands executed",
      resolved.args,
    ),
    commands: buildCommands({
      ...resolved.args,
      mint: resolved.args.mint,
      intent: resolved.args.intent,
    }),
  };
}

function main(): void {
  const output = buildOutput(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(output, null, 2));
  if (output.status !== "ok") {
    process.exitCode = 1;
  }
}

main();
