import "dotenv/config";

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./db.js";

const NEAR_TERM_GOAL = "3_to_6_hour_bounded_monitoring_mvp";
const NEXT_RECOMMENDED_SLICE = "three_hour_dry_run";

const REQUIRED_COMMANDS = [
  "detect:geckoterminal:new-pools",
  "detect:dexscreener:token-profiles",
  "ops:catchup:gecko",
  "metric:snapshot:geckoterminal",
  "metrics:report",
  "notification:send",
  "notification:retry:plan",
  "token:observation",
  "tokens:observation-gaps",
  "holder:gaps:plan",
  "community:gaps:plan",
] as const;

type CommandName = (typeof REQUIRED_COMMANDS)[number];

type BoundedWatchReadinessOutput = {
  status: "ok";
  mode: "read_only_bounded_watch_readiness";
  readOnly: true;
  willWrite: false;
  willFetch: false;
  willSendTelegram: false;
  willUpdateCheckpoint: false;
  nearTermGoal: typeof NEAR_TERM_GOAL;
  nextRecommendedSlice: typeof NEXT_RECOMMENDED_SLICE;
  database: {
    tokenCount: number;
    metricCount: number;
    notificationCount: number;
  };
  commandAvailability: Record<CommandName, boolean>;
  support: {
    detection: {
      geckoterminalNewPools: boolean;
      dexscreenerTokenProfiles: boolean;
      geckoCatchupHelper: boolean;
    };
    checkpoint: {
      available: boolean;
      activeOnlyWithWatchAndWrite: true;
      updateCommands: string[];
      defaultCheckpointFiles: string[];
      readOnlyCliWillUpdateCheckpoint: false;
    };
    dedupe: {
      tokenMintUnique: boolean;
      existingTokenSkipPath: boolean;
    };
    metricAccumulation: {
      snapshotCommandAvailable: boolean;
      reportCommandAvailable: boolean;
    };
    notification: {
      captureAvailable: boolean;
      liveSendCommandAvailable: boolean;
      retryPlanAvailable: boolean;
      sentRowResendPreventionAvailable: boolean;
    };
    observation: {
      tokenObservationAvailable: boolean;
      tokenGapPlanAvailable: boolean;
      holderGapPlanAvailable: boolean;
      communityGapPlanAvailable: boolean;
    };
  };
  readiness: {
    sourceDetectionAvailable: boolean;
    boundedLimitAvailable: boolean;
    dryRunAvailable: boolean;
    writeModeAvailable: boolean;
    checkpointAvailable: boolean;
    dedupeAvailable: boolean;
    metricAccumulationAvailable: boolean;
    notificationCaptureAvailable: boolean;
    telegramLiveSendAvailable: boolean;
    observationReviewAvailable: boolean;
    threeHourRunReady: false;
    sixHourRunReady: false;
    schedulerReady: false;
    systemdReady: false;
  };
  blockers: string[];
  warnings: string[];
  nextCommands: {
    threeHourDryRun: string | null;
    threeHourWriteRehearsal: string | null;
    sixHourMonitoredRun: string | null;
    reason: string;
  };
};

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function readPackageScripts(): Promise<Record<string, string>> {
  const packageJson = JSON.parse(
    await readFile(resolve(repoRoot(), "package.json"), "utf-8"),
  ) as {
    scripts?: Record<string, string>;
  };

  return packageJson.scripts ?? {};
}

async function readSchema(): Promise<string> {
  return readFile(resolve(repoRoot(), "prisma", "schema.prisma"), "utf-8");
}

function hasScript(scripts: Record<string, string>, command: CommandName): boolean {
  return Object.prototype.hasOwnProperty.call(scripts, command);
}

function buildCommandAvailability(scripts: Record<string, string>): Record<CommandName, boolean> {
  return Object.fromEntries(
    REQUIRED_COMMANDS.map((command) => [command, hasScript(scripts, command)]),
  ) as Record<CommandName, boolean>;
}

function buildSupport(
  commandAvailability: Record<CommandName, boolean>,
  schema: string,
): BoundedWatchReadinessOutput["support"] {
  const notificationSendScript = commandAvailability["notification:send"];
  const notificationRetryPlanScript = commandAvailability["notification:retry:plan"];

  return {
    detection: {
      geckoterminalNewPools: commandAvailability["detect:geckoterminal:new-pools"],
      dexscreenerTokenProfiles: commandAvailability["detect:dexscreener:token-profiles"],
      geckoCatchupHelper: commandAvailability["ops:catchup:gecko"],
    },
    checkpoint: {
      available:
        commandAvailability["detect:geckoterminal:new-pools"] &&
        commandAvailability["detect:dexscreener:token-profiles"],
      activeOnlyWithWatchAndWrite: true,
      updateCommands: [
        "detect:geckoterminal:new-pools --watch --write",
        "detect:dexscreener:token-profiles --watch --write",
      ],
      defaultCheckpointFiles: [
        "data/checkpoints/geckoterminal-new-pools.json",
        "data/checkpoints/dexscreener-token-profiles-latest-v1.json",
      ],
      readOnlyCliWillUpdateCheckpoint: false,
    },
    dedupe: {
      tokenMintUnique: /model\s+Token[\s\S]*?mint\s+String\s+@unique/.test(schema),
      existingTokenSkipPath: true,
    },
    metricAccumulation: {
      snapshotCommandAvailable: commandAvailability["metric:snapshot:geckoterminal"],
      reportCommandAvailable: commandAvailability["metrics:report"],
    },
    notification: {
      captureAvailable: commandAvailability["metric:snapshot:geckoterminal"],
      liveSendCommandAvailable: notificationSendScript,
      retryPlanAvailable: notificationRetryPlanScript,
      sentRowResendPreventionAvailable: notificationSendScript,
    },
    observation: {
      tokenObservationAvailable: commandAvailability["token:observation"],
      tokenGapPlanAvailable: commandAvailability["tokens:observation-gaps"],
      holderGapPlanAvailable: commandAvailability["holder:gaps:plan"],
      communityGapPlanAvailable: commandAvailability["community:gaps:plan"],
    },
  };
}

function buildReadiness(
  support: BoundedWatchReadinessOutput["support"],
): BoundedWatchReadinessOutput["readiness"] {
  const sourceDetectionAvailable =
    support.detection.geckoterminalNewPools && support.detection.dexscreenerTokenProfiles;
  const metricAccumulationAvailable =
    support.metricAccumulation.snapshotCommandAvailable &&
    support.metricAccumulation.reportCommandAvailable;
  const observationReviewAvailable =
    support.observation.tokenObservationAvailable &&
    support.observation.tokenGapPlanAvailable &&
    support.observation.holderGapPlanAvailable &&
    support.observation.communityGapPlanAvailable;

  return {
    sourceDetectionAvailable,
    boundedLimitAvailable: sourceDetectionAvailable,
    dryRunAvailable: sourceDetectionAvailable,
    writeModeAvailable: sourceDetectionAvailable,
    checkpointAvailable: support.checkpoint.available,
    dedupeAvailable: support.dedupe.tokenMintUnique && support.dedupe.existingTokenSkipPath,
    metricAccumulationAvailable,
    notificationCaptureAvailable: support.notification.captureAvailable,
    telegramLiveSendAvailable: support.notification.liveSendCommandAvailable,
    observationReviewAvailable,
    threeHourRunReady: false,
    sixHourRunReady: false,
    schedulerReady: false,
    systemdReady: false,
  };
}

function buildBlockers(): string[] {
  return [
    "source detection dry-run not yet verified",
    "checkpoint update path not yet verified",
    "3h dry-run not yet executed",
    "3h write run not yet executed",
    "6h run not yet executed",
    "scheduler/systemd not enabled",
    "Pro API parked",
    "paid holder source parked",
  ];
}

function buildWarnings(): string[] {
  return [
    "next commands are suggestions only and are not executed by this read-only report",
    "checkpoint updates only happen in detect watch write flows with explicit approval",
    "scheduler and systemd stay post-readiness until bounded runs are verified",
  ];
}

function buildNextCommands(
  readiness: BoundedWatchReadinessOutput["readiness"],
): BoundedWatchReadinessOutput["nextCommands"] {
  if (!readiness.sourceDetectionAvailable || !readiness.boundedLimitAvailable) {
    return {
      threeHourDryRun: null,
      threeHourWriteRehearsal: null,
      sixHourMonitoredRun: null,
      reason: "exact existing detect watch command not confirmed",
    };
  }

  return {
    threeHourDryRun:
      "pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 180 --intervalSeconds 60",
    threeHourWriteRehearsal:
      "pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 180 --intervalSeconds 60 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json",
    sixHourMonitoredRun: null,
    reason: "six_hour_run_waits_for_successful_three_hour_dry_run_and_write_rehearsal",
  };
}

export async function buildBoundedWatchReadinessReport(): Promise<BoundedWatchReadinessOutput> {
  const [
    tokenCount,
    metricCount,
    notificationCount,
    scripts,
    schema,
  ] = await Promise.all([
    db.token.count(),
    db.metric.count(),
    db.notification.count(),
    readPackageScripts(),
    readSchema(),
  ]);

  const commandAvailability = buildCommandAvailability(scripts);
  const support = buildSupport(commandAvailability, schema);
  const readiness = buildReadiness(support);

  return {
    status: "ok",
    mode: "read_only_bounded_watch_readiness",
    readOnly: true,
    willWrite: false,
    willFetch: false,
    willSendTelegram: false,
    willUpdateCheckpoint: false,
    nearTermGoal: NEAR_TERM_GOAL,
    nextRecommendedSlice: NEXT_RECOMMENDED_SLICE,
    database: {
      tokenCount,
      metricCount,
      notificationCount,
    },
    commandAvailability,
    support,
    readiness,
    blockers: buildBlockers(),
    warnings: buildWarnings(),
    nextCommands: buildNextCommands(readiness),
  };
}

async function run(): Promise<void> {
  const report = await buildBoundedWatchReadinessReport();
  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
