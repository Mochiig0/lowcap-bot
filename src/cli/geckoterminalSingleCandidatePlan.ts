import "dotenv/config";

import { db } from "./db.js";
import { buildSafeMetricSummary } from "./metricSafeSummary.js";

const GECKOTERMINAL_METRIC_SOURCE = "geckoterminal.token_snapshot";
const REPO_ROOT = "/home/mochi/projects/lowcap-bot";

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

type PlanStatus = "ok" | "stop";

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
  sideEffectUpperBound: string | null;
  stopConditions: string[];
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

    if (key !== "--mint" && key !== "--expectedMetricsCount") {
      return { error: `Unknown option: ${key}`, errorStage: "invalid_args" };
    }

    if (value === undefined || value.startsWith("--") || value === "") {
      return { error: `Missing value for ${key}`, errorStage: "invalid_args" };
    }

    if (key === "--mint") {
      out.mint = value;
    } else {
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
    sideEffectUpperBound: null,
    stopConditions: COMMON_STOP_CONDITIONS,
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
  "status" | "currentStage" | "nextStage" | "reason" | "nextRedCommand" | "sideEffectUpperBound"
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
    rawJsonFreeRequired: true,
  };
}

async function buildPlan(
  mint: string,
  options: {
    expectedMetricsCount?: number;
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
      sideEffectUpperBound: null,
    };
  }

  if (token.hardRejected) {
    return {
      ...base,
      status: "stop",
      currentStage: "manual_review_required",
      nextStage: null,
      reason: "hardRejected=true; manual review required before planning a Red command",
      nextRedCommand: null,
      sideEffectUpperBound: null,
    };
  }

  if (
    latestMetricSource !== null &&
    latestMetricSource !== GECKOTERMINAL_METRIC_SOURCE
  ) {
    return {
      ...base,
      status: "stop",
      currentStage: "manual_review_required",
      nextStage: null,
      reason: `latestMetricSource mismatch: ${latestMetricSource}`,
      nextRedCommand: null,
      sideEffectUpperBound: null,
    };
  }

  if (token.metadataStatus === "mint_only" && metricsCount === 0) {
    return {
      ...base,
      status: "ok",
      currentStage: "mint_only_without_metrics",
      nextStage: "enrich_write",
      reason: "mint_only Token has no metrics; next Red gate is single-mint enrich/rescore write after dry-run confirmation",
      nextRedCommand: enrichWriteCommand(token.mint),
      sideEffectUpperBound:
        "target mint Token fields update only; enrichWriteCount<=1; rescoreWriteCount<=1; notifySentCount=0",
    };
  }

  if (token.metadataStatus === "partial" && metricsCount === 0) {
    return {
      ...base,
      status: "ok",
      currentStage: "partial_without_metrics",
      nextStage: "metric_write",
      reason: "partial Token has no metrics; next Red gate is single-mint metric snapshot write after dry-run confirmation",
      nextRedCommand: metricWriteCommand(token.mint),
      sideEffectUpperBound:
        "target mint one geckoterminal.token_snapshot Metric append; writtenCount<=1",
    };
  }

  if (token.metadataStatus === "partial" && metricsCount === 1) {
    return {
      ...base,
      status: "ok",
      currentStage: "partial_with_one_metric",
      nextStage: "second_metric_write_or_tmux_single",
      reason: "partial Token has one metric; next Red gate can append one additional metric through the single-mint tmux operator flow after dry-run confirmation",
      nextRedCommand: tmuxSingleMetricCommand(token.mint),
      sideEffectUpperBound:
        "tmux single-run; target mint one geckoterminal.token_snapshot Metric append; writtenCount<=1",
    };
  }

  if (metricsCount >= 2) {
    return {
      ...base,
      status: "ok",
      currentStage: "two_or_more_metrics",
      nextStage: "report_confirmation_or_stop",
      reason: "metricsCount>=2; no write needed without a fresh preflight",
      nextRedCommand: null,
      sideEffectUpperBound: null,
    };
  }

  return {
    ...base,
    status: "stop",
    currentStage: "manual_review_required",
    nextStage: null,
    reason: `Unsupported planner state: metadataStatus=${token.metadataStatus}, metricsCount=${metricsCount}`,
    nextRedCommand: null,
    sideEffectUpperBound: null,
  };
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
