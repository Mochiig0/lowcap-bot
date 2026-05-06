const ALLOWED_METADATA_STATUSES = new Set(["mint_only", "partial", "enriched"]);
const ALLOWED_STAGES = new Set([
  "mint_only_without_metrics",
  "partial_without_metrics",
  "partial_with_one_metric",
  "two_or_more_metrics",
  "manual_review_required",
]);

type Args = {
  mint?: string;
  expectedMetricsCount?: number;
  expectedMetadataStatus?: string;
  expectedStage?: string;
  error?: string;
};

type GuideStep = {
  order: number;
  stage: string;
  kind: string;
  commands?: string[];
  description?: string;
  willExecute: false;
};

type GuideOutput = {
  status: "ok" | "stop";
  reason: string;
  mint: string | null;
  mode: "non_executor_guide";
  willExecute: false;
  executor: "human";
  rawJsonFreeRequired: true;
  steps: GuideStep[];
  forbidden: string[];
  notes: string[];
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--") continue;

    if (
      key !== "--mint" &&
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

    if (key === "--expectedStage") {
      if (out.expectedStage !== undefined) {
        return { error: "invalid_args: duplicate --expectedStage" };
      }
      if (!ALLOWED_STAGES.has(value)) {
        return { error: `invalid_args: invalid expectedStage ${value}` };
      }
      out.expectedStage = value;
      i += 1;
    }
  }

  return out;
}

function forbidden(): string[] {
  return [
    "existing CLI execution by guide",
    "nextRedCommand execution",
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
}

function notes(): string[] {
  return [
    "This guide prints command strings only.",
    "Planner and validator must be run by the operator.",
    "Red execution requires a separate human-approved Red task.",
  ];
}

function plannerCommand(args: Args & { mint: string }): string {
  const parts = [
    "pnpm -s ops:gecko:single-candidate:plan --",
    "--mint",
    args.mint,
  ];

  if (args.expectedMetricsCount !== undefined) {
    parts.push("--expectedMetricsCount", String(args.expectedMetricsCount));
  }
  if (args.expectedMetadataStatus !== undefined) {
    parts.push("--expectedMetadataStatus", args.expectedMetadataStatus);
  }
  if (args.expectedStage !== undefined) {
    parts.push("--expectedStage", args.expectedStage);
  }

  return `${parts.join(" ")} > /tmp/lowcap-planner.json`;
}

function buildSteps(args: Args & { mint: string }): GuideStep[] {
  return [
    {
      order: 1,
      stage: "baseline",
      kind: "read_only",
      commands: [
        `pnpm -s token:compare -- --mint ${args.mint}`,
        `pnpm -s metrics:report -- --mint ${args.mint} --limit 2`,
      ],
      willExecute: false,
    },
    {
      order: 2,
      stage: "planner",
      kind: "read_only",
      commands: [plannerCommand(args)],
      willExecute: false,
    },
    {
      order: 3,
      stage: "validator",
      kind: "read_only",
      commands: [
        "pnpm -s ops:gecko:single-candidate:validate -- --plannerJson /tmp/lowcap-planner.json",
      ],
      willExecute: false,
    },
    {
      order: 4,
      stage: "human_gate",
      kind: "approval",
      description:
        "Only proceed if validator approvalReady=true and canProceedToHumanGate=true.",
      willExecute: false,
    },
    {
      order: 5,
      stage: "red_execution",
      kind: "red_placeholder",
      description:
        "Run exact planner nextRedCommand in a separate Red task only.",
      willExecute: false,
    },
    {
      order: 6,
      stage: "report_confirmation",
      kind: "read_only",
      commands: [
        `pnpm -s metrics:report -- --mint ${args.mint} --limit 2`,
        `pnpm -s token:compare -- --mint ${args.mint}`,
      ],
      willExecute: false,
    },
    {
      order: 7,
      stage: "docs_record",
      kind: "green_docs_only",
      description:
        "Record the passed Red result in docs in a separate Green task.",
      willExecute: false,
    },
  ];
}

function outputBase(status: "ok" | "stop", reason: string, mint: string | null): GuideOutput {
  return {
    status,
    reason,
    mint,
    mode: "non_executor_guide",
    willExecute: false,
    executor: "human",
    rawJsonFreeRequired: true,
    steps: [],
    forbidden: forbidden(),
    notes: notes(),
  };
}

function buildOutput(args: Args): GuideOutput {
  if (args.error !== undefined) {
    return outputBase("stop", args.error, args.mint ?? null);
  }

  if (args.mint === undefined) {
    return outputBase("stop", "missing mint: provide --mint <MINT>", null);
  }

  return {
    ...outputBase("ok", "bounded flow guide generated; no commands executed", args.mint),
    steps: buildSteps({ ...args, mint: args.mint }),
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
