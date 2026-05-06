import "dotenv/config";

import { db } from "./db.js";
import { buildSafeMetricSummary } from "./metricSafeSummary.js";

const GECKOTERMINAL_METRIC_SOURCE = "geckoterminal.token_snapshot";
const REPO_ROOT = "/home/mochi/projects/lowcap-bot";
const ALLOWED_EXPECTED_METADATA_STATUSES = new Set([
  "mint_only",
  "partial",
  "enriched",
]);
const ALLOWED_EXPECTED_STAGES = new Set([
  "mint_only_without_metrics",
  "partial_without_metrics",
  "partial_with_one_metric",
  "two_or_more_metrics",
  "manual_review_required",
]);

const COMMON_STOP_CONDITIONS = [
  "mint is missing or ambiguous",
  "expected metadataStatus / metricsCount guard mismatch",
  "selectedCount or writtenCount would exceed 1",
  "errorCount > 0",
  "rawJson / secret / env output risk",
  "Telegram / ops / systemd / scheduler / queue expansion risk",
  "unbounded watch / default checkpoint expansion risk",
  "git status dirty",
];

const COMMON_STOP_CONDITION_CODES = [
  "mint_missing_or_ambiguous",
  "guard_mismatch",
  "invalid_args",
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
  "git_dirty",
] as const;

type PlanStatus = "ok" | "stop";
type NextRedCommandKind =
  | "gecko_enrich_rescore_single_mint"
  | "gecko_metric_snapshot_single_mint"
  | "tmux_metric_single_mint"
  | null;
type PlanExecutor = "human" | "none";
type StopConditionCode = (typeof COMMON_STOP_CONDITION_CODES)[number];

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

type PlanOutput = {
  status: PlanStatus;
  mint: string | null;
  currentStage: string;
  nextStage: string | null;
  reason: string;
  guards: {
    metadataStatus: string | null;
    metricsCount: number | null;
    hardRejected: boolean | null;
    latestMetricSource: string | null;
  };
  currentToken: {
    mint: string;
    source: string | null;
    name: string | null;
    symbol: string | null;
    metadataStatus: string;
    scoreRank: string;
    scoreTotal: number;
    hardRejected: boolean;
  } | null;
  latestMetric: SafeMetricPlanItem | null;
  recentMetrics: SafeMetricPlanItem[];
  readOnlyCommands: string[];
  nextRedCommand: string | null;
  nextRedCommandKind: NextRedCommandKind;
  requiresHumanApproval: boolean;
  executor: PlanExecutor;
  willExecute: false;
  sideEffectUpperBound: string | null;
  sideEffectUpperBoundSpec: SideEffectUpperBoundSpec;
  stopConditions: string[];
  stopConditionCodes: StopConditionCode[];
  rawJsonFreeRequired: true;
};

type SafeMetricPlanItem = {
  id: number;
  source: string | null;
  observedAt: string;
  volume24h: number | null;
  safeSummary: {
    priceUsdPresent: boolean;
    fdvUsdPresent: boolean;
    reserveUsdPresent: boolean;
    topPoolPresent: boolean;
  };
};

type Args = {
  mint?: string;
  expectedMetricsCount?: number;
  expectedMetadataStatus?: string;
  expectedStage?: string;
  error?: string;
  errorStage?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--") continue;
    if (!key.startsWith("--")) continue;

    if (
      key !== "--mint" &&
      key !== "--expectedMetricsCount" &&
      key !== "--expectedMetadataStatus" &&
      key !== "--expectedStage"
    ) {
      return { error: `Unknown option: ${key}`, errorStage: "invalid_args" };
    }

    if (value === undefined || value.startsWith("--")) {
      return { error: `Missing value for ${key}`, errorStage: "invalid_args" };
    }

    if (key === "--mint") {
      if (value === "") {
        return { error: `Missing value for ${key}`, errorStage: "invalid_args" };
      }

      out.mint = value;
    } else if (key === "--expectedMetricsCount") {
      if (value === "") {
        return { error: `Missing value for ${key}`, errorStage: "invalid_args" };
      }

      const expectedMetricsCount = Number(value);
      if (
        !Number.isInteger(expectedMetricsCount) ||
        expectedMetricsCount < 0
      ) {
        return {
          error: `Invalid expectedMetricsCount: ${value}`,
          errorStage: "invalid_args",
        };
      }

      out.expectedMetricsCount = expectedMetricsCount;
    } else if (key === "--expectedMetadataStatus") {
      if (value === "") {
        return { error: `Missing value for ${key}`, errorStage: "invalid_args" };
      }

      if (!ALLOWED_EXPECTED_METADATA_STATUSES.has(value)) {
        return {
          error: `Invalid expectedMetadataStatus: ${value}`,
          errorStage: "invalid_args",
        };
      }

      out.expectedMetadataStatus = value;
    } else {
      if (!ALLOWED_EXPECTED_STAGES.has(value)) {
        return {
          error: `Invalid expectedStage: ${value}`,
          errorStage: "invalid_args",
        };
      }

      out.expectedStage = value;
    }

    i += 1;
  }

  if (!out.mint) {
    return { error: "Missing required --mint", errorStage: "missing_mint_arg" };
  }

  return out;
}

function readOnlyCommands(mint: string): string[] {
  return [
    `pnpm -s token:compare -- --mint ${mint}`,
    `pnpm -s metrics:report -- --mint ${mint} --limit 2`,
  ];
}

function enrichWriteCommand(mint: string): string {
  return `pnpm -s token:enrich-rescore:geckoterminal -- --mint ${mint} --write`;
}

function metricWriteCommand(mint: string): string {
  return `pnpm -s metric:snapshot:geckoterminal -- --mint ${mint} --write`;
}

function tmuxSingleMetricCommand(mint: string): string {
  return `tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd ${REPO_ROOT} && pnpm -s metric:snapshot:geckoterminal -- --mint ${mint} --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"`;
}

function sideEffectUpperBoundSpecForKind(
  kind: NextRedCommandKind,
): SideEffectUpperBoundSpec {
  const base = {
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

  if (kind === "gecko_enrich_rescore_single_mint") {
    return {
      ...base,
      tokenWrite: true,
      tokenWriteMax: 1,
    };
  }

  if (kind === "gecko_metric_snapshot_single_mint") {
    return {
      ...base,
      metricWriteMax: 1,
    };
  }

  if (kind === "tmux_metric_single_mint") {
    return {
      ...base,
      metricWriteMax: 1,
      tmux: true,
      tmuxSession: "lowcap-gecko-metric-single",
    };
  }

  return base;
}

function redCommandSafety(
  kind: Exclude<NextRedCommandKind, null>,
): Pick<
  PlanOutput,
  | "nextRedCommandKind"
  | "requiresHumanApproval"
  | "executor"
  | "willExecute"
  | "sideEffectUpperBoundSpec"
> {
  return {
    nextRedCommandKind: kind,
    requiresHumanApproval: true,
    executor: "human",
    willExecute: false,
    sideEffectUpperBoundSpec: sideEffectUpperBoundSpecForKind(kind),
  };
}

function noRedCommandSafety(): Pick<
  PlanOutput,
  | "nextRedCommandKind"
  | "requiresHumanApproval"
  | "executor"
  | "willExecute"
  | "sideEffectUpperBoundSpec"
> {
  return {
    nextRedCommandKind: null,
    requiresHumanApproval: false,
    executor: "none",
    willExecute: false,
    sideEffectUpperBoundSpec: sideEffectUpperBoundSpecForKind(null),
  };
}

function emptyGuards(): PlanOutput["guards"] {
  return {
    metadataStatus: null,
    metricsCount: null,
    hardRejected: null,
    latestMetricSource: null,
  };
}

function stopOutput(
  mint: string | null,
  currentStage: string,
  reason: string,
  overrides: Partial<PlanOutput> = {},
): PlanOutput {
  return {
    status: "stop",
    mint,
    currentStage,
    nextStage: null,
    reason,
    guards: emptyGuards(),
    currentToken: null,
    latestMetric: null,
    recentMetrics: [],
    readOnlyCommands: mint ? readOnlyCommands(mint) : [],
    nextRedCommand: null,
    ...noRedCommandSafety(),
    sideEffectUpperBound: null,
    stopConditions: COMMON_STOP_CONDITIONS,
    stopConditionCodes: [...COMMON_STOP_CONDITION_CODES],
    rawJsonFreeRequired: true,
    ...overrides,
  };
}

function safeMetric(metric: {
  id: number;
  source: string | null;
  observedAt: Date;
  volume24h: number | null;
  rawJson: unknown;
}): SafeMetricPlanItem {
  return {
    id: metric.id,
    source: metric.source,
    observedAt: metric.observedAt.toISOString(),
    volume24h: metric.volume24h,
    safeSummary: buildSafeMetricSummary(metric.rawJson),
  };
}

function baseOutput(token: {
  mint: string;
  source: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreRank: string;
  scoreTotal: number;
  hardRejected: boolean;
  metrics: Array<{
    id: number;
    source: string | null;
    observedAt: Date;
    volume24h: number | null;
    rawJson: unknown;
  }>;
  _count: {
    metrics: number;
  };
}): Omit<
  PlanOutput,
  | "status"
  | "currentStage"
  | "nextStage"
  | "reason"
  | "nextRedCommand"
  | "nextRedCommandKind"
  | "requiresHumanApproval"
  | "executor"
  | "willExecute"
  | "sideEffectUpperBound"
  | "sideEffectUpperBoundSpec"
> {
  const recentMetrics = token.metrics.map(safeMetric);
  const latestMetric = recentMetrics[0] ?? null;

  return {
    mint: token.mint,
    guards: {
      metadataStatus: token.metadataStatus,
      metricsCount: token._count.metrics,
      hardRejected: token.hardRejected,
      latestMetricSource: latestMetric?.source ?? null,
    },
    currentToken: {
      mint: token.mint,
      source: token.source,
      name: token.name,
      symbol: token.symbol,
      metadataStatus: token.metadataStatus,
      scoreRank: token.scoreRank,
      scoreTotal: token.scoreTotal,
      hardRejected: token.hardRejected,
    },
    latestMetric,
    recentMetrics,
    readOnlyCommands: readOnlyCommands(token.mint),
    stopConditions: COMMON_STOP_CONDITIONS,
    stopConditionCodes: [...COMMON_STOP_CONDITION_CODES],
    rawJsonFreeRequired: true,
  };
}

function applyExpectedStageGuard(
  output: PlanOutput,
  expectedStage?: string,
): PlanOutput {
  if (expectedStage === undefined || output.currentStage === expectedStage) {
    return output;
  }

  return {
    ...output,
    status: "stop",
    currentStage: "guard_mismatch",
    nextStage: null,
    reason: `expectedStage mismatch: expected ${expectedStage}, actual ${output.currentStage}`,
    nextRedCommand: null,
    ...noRedCommandSafety(),
    sideEffectUpperBound: null,
  };
}

async function buildPlan(
  mint: string,
  options: {
    expectedMetricsCount?: number;
    expectedMetadataStatus?: string;
    expectedStage?: string;
  } = {},
): Promise<PlanOutput> {
  const token = await db.token.findUnique({
    where: {
      mint,
    },
    select: {
      mint: true,
      source: true,
      name: true,
      symbol: true,
      metadataStatus: true,
      scoreRank: true,
      scoreTotal: true,
      hardRejected: true,
      _count: {
        select: {
          metrics: true,
        },
      },
      metrics: {
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        take: 2,
        select: {
          id: true,
          source: true,
          observedAt: true,
          volume24h: true,
          rawJson: true,
        },
      },
    },
  });

  if (!token) {
    return stopOutput(mint, "missing_token", "Token not found for mint");
  }

  const base = baseOutput(token);
  const metricsCount = token._count.metrics;
  const latestMetricSource = base.latestMetric?.source ?? null;

  if (
    options.expectedMetadataStatus !== undefined &&
    token.metadataStatus !== options.expectedMetadataStatus
  ) {
    return {
      ...base,
      status: "stop",
      currentStage: "guard_mismatch",
      nextStage: null,
      reason: `expectedMetadataStatus mismatch: expected ${options.expectedMetadataStatus}, actual ${token.metadataStatus}`,
      nextRedCommand: null,
      ...noRedCommandSafety(),
      sideEffectUpperBound: null,
    };
  }

  if (
    options.expectedMetricsCount !== undefined &&
    metricsCount !== options.expectedMetricsCount
  ) {
    return {
      ...base,
      status: "stop",
      currentStage: "guard_mismatch",
      nextStage: null,
      reason: `expectedMetricsCount mismatch: expected ${options.expectedMetricsCount}, actual ${metricsCount}`,
      nextRedCommand: null,
      ...noRedCommandSafety(),
      sideEffectUpperBound: null,
    };
  }

  if (token.hardRejected) {
    return applyExpectedStageGuard(
      {
        ...base,
        status: "stop",
        currentStage: "manual_review_required",
        nextStage: null,
        reason: "hardRejected=true; manual review required before planning a Red command",
        nextRedCommand: null,
        ...noRedCommandSafety(),
        sideEffectUpperBound: null,
      },
      options.expectedStage,
    );
  }

  if (
    latestMetricSource !== null &&
    latestMetricSource !== GECKOTERMINAL_METRIC_SOURCE
  ) {
    return applyExpectedStageGuard(
      {
        ...base,
        status: "stop",
        currentStage: "manual_review_required",
        nextStage: null,
        reason: `latestMetricSource mismatch: ${latestMetricSource}`,
        nextRedCommand: null,
        ...noRedCommandSafety(),
        sideEffectUpperBound: null,
      },
      options.expectedStage,
    );
  }

  if (token.metadataStatus === "mint_only" && metricsCount === 0) {
    return applyExpectedStageGuard(
      {
        ...base,
        status: "ok",
        currentStage: "mint_only_without_metrics",
        nextStage: "enrich_write",
        reason: "mint_only Token has no metrics; next Red gate is single-mint enrich/rescore write after dry-run confirmation",
        nextRedCommand: enrichWriteCommand(token.mint),
        ...redCommandSafety("gecko_enrich_rescore_single_mint"),
        sideEffectUpperBound:
          "target mint Token fields update only; enrichWriteCount<=1; rescoreWriteCount<=1; notifySentCount=0",
      },
      options.expectedStage,
    );
  }

  if (token.metadataStatus === "partial" && metricsCount === 0) {
    return applyExpectedStageGuard(
      {
        ...base,
        status: "ok",
        currentStage: "partial_without_metrics",
        nextStage: "metric_write",
        reason: "partial Token has no metrics; next Red gate is single-mint metric snapshot write after dry-run confirmation",
        nextRedCommand: metricWriteCommand(token.mint),
        ...redCommandSafety("gecko_metric_snapshot_single_mint"),
        sideEffectUpperBound:
          "target mint one geckoterminal.token_snapshot Metric append; writtenCount<=1",
      },
      options.expectedStage,
    );
  }

  if (token.metadataStatus === "partial" && metricsCount === 1) {
    return applyExpectedStageGuard(
      {
        ...base,
        status: "ok",
        currentStage: "partial_with_one_metric",
        nextStage: "second_metric_write_or_tmux_single",
        reason: "partial Token has one metric; next Red gate can append one additional metric through the single-mint tmux operator flow after dry-run confirmation",
        nextRedCommand: tmuxSingleMetricCommand(token.mint),
        ...redCommandSafety("tmux_metric_single_mint"),
        sideEffectUpperBound:
          "tmux single-run; target mint one geckoterminal.token_snapshot Metric append; writtenCount<=1",
      },
      options.expectedStage,
    );
  }

  if (metricsCount >= 2) {
    return applyExpectedStageGuard(
      {
        ...base,
        status: "ok",
        currentStage: "two_or_more_metrics",
        nextStage: "report_confirmation_or_stop",
        reason: "metricsCount>=2; no write needed without a fresh preflight",
        nextRedCommand: null,
        ...noRedCommandSafety(),
        sideEffectUpperBound: null,
      },
      options.expectedStage,
    );
  }

  return applyExpectedStageGuard(
    {
      ...base,
      status: "stop",
      currentStage: "manual_review_required",
      nextStage: null,
      reason: `Unsupported planner state: metadataStatus=${token.metadataStatus}, metricsCount=${metricsCount}`,
      nextRedCommand: null,
      ...noRedCommandSafety(),
      sideEffectUpperBound: null,
    },
    options.expectedStage,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.error || !args.mint) {
    const output = stopOutput(
      args.mint ?? null,
      args.errorStage ?? "invalid_args",
      args.error ?? "Missing required --mint",
    );
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = 1;
    return;
  }

  const output = await buildPlan(args.mint, {
    expectedMetricsCount: args.expectedMetricsCount,
    expectedMetadataStatus: args.expectedMetadataStatus,
    expectedStage: args.expectedStage,
  });
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
