import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./db.js";

const NEAR_TERM_GOAL = "3_to_6_hour_bounded_monitoring_mvp";
const NEXT_RECOMMENDED_SLICE = "bounded_watch_readiness_check";

const REQUIRED_COMMANDS = [
  "token:observation",
  "tokens:observation-gaps",
  "community:gaps:plan",
  "holder:gaps:plan",
  "holder:snapshot:show",
  "notification:retry:plan",
  "detect:dexscreener:token-profiles",
  "detect:geckoterminal:new-pools",
  "token:enrich-rescore:geckoterminal",
  "metric:snapshot:geckoterminal",
  "ops:summary:geckoterminal",
  "review:queue:geckoterminal",
] as const;

type CommandName = (typeof REQUIRED_COMMANDS)[number];

type MigrationRow = {
  migration_name: string;
};

type SqliteTableRow = {
  name: string;
};

type MigrationSummary = {
  status: "ok" | "warning";
  summary: string;
  migrationDirectoryCount: number;
  appliedMigrationCount: number | null;
  pendingMigrationNames: string[];
  unknownAppliedMigrationNames: string[];
  driftCheck: "not_run_read_only_cli";
  resetRequired: false | null;
  warnings: string[];
};

type MvpStatusOutput = {
  status: "ok";
  mode: "read_only_mvp_status";
  readOnly: true;
  willWrite: false;
  willFetch: false;
  willSendTelegram: false;
  database: {
    tokenCount: number;
    metricCount: number;
    notificationCount: number;
    holderSnapshotCount: number;
  };
  migrations: MigrationSummary;
  commandAvailability: Record<CommandName, boolean>;
  readiness: {
    importScoringReady: boolean;
    observationReportsReady: boolean;
    notificationManualRetryReady: boolean;
    holderSnapshotLoopReady: boolean;
    boundedWatchReady: boolean;
    checkpointReady: boolean;
    telegramLiveSendReady: boolean;
    schedulerReady: boolean;
    systemdReady: boolean;
  };
  blockers: string[];
  nearTermGoal: typeof NEAR_TERM_GOAL;
  nextRecommendedSlice: typeof NEXT_RECOMMENDED_SLICE;
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

async function readMigrationNamesFromDisk(): Promise<string[]> {
  const migrationsDir = resolve(repoRoot(), "prisma", "migrations");
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function readAppliedMigrationNames(): Promise<{
  names: string[] | null;
  warning: string | null;
}> {
  try {
    const migrationTables = await db.$queryRaw<SqliteTableRow[]>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = '_prisma_migrations'
    `;

    if (migrationTables.length === 0) {
      return {
        names: null,
        warning: "migration_table_unavailable",
      };
    }

    const rows = await db.$queryRaw<MigrationRow[]>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE rolled_back_at IS NULL
      ORDER BY finished_at ASC, migration_name ASC
    `;

    return {
      names: rows.map((row) => row.migration_name).sort(),
      warning: null,
    };
  } catch {
    return {
      names: null,
      warning: "migration_table_unavailable",
    };
  }
}

async function buildMigrationSummary(): Promise<MigrationSummary> {
  const diskMigrationNames = await readMigrationNamesFromDisk();
  const applied = await readAppliedMigrationNames();
  const warnings = applied.warning ? [applied.warning] : [];

  if (applied.names === null) {
    return {
      status: "warning",
      summary: "migration_table_unavailable",
      migrationDirectoryCount: diskMigrationNames.length,
      appliedMigrationCount: null,
      pendingMigrationNames: diskMigrationNames,
      unknownAppliedMigrationNames: [],
      driftCheck: "not_run_read_only_cli",
      resetRequired: null,
      warnings,
    };
  }

  const appliedSet = new Set(applied.names);
  const diskSet = new Set(diskMigrationNames);
  const pendingMigrationNames = diskMigrationNames.filter((name) => !appliedSet.has(name));
  const unknownAppliedMigrationNames = applied.names.filter((name) => !diskSet.has(name));

  if (pendingMigrationNames.length > 0) {
    warnings.push("pending_migrations_detected");
  }

  if (unknownAppliedMigrationNames.length > 0) {
    warnings.push("applied_migrations_missing_from_repo");
  }

  return {
    status: warnings.length === 0 ? "ok" : "warning",
    summary: warnings.length === 0 ? "applied_migrations_match_repo" : "migration_review_needed",
    migrationDirectoryCount: diskMigrationNames.length,
    appliedMigrationCount: applied.names.length,
    pendingMigrationNames,
    unknownAppliedMigrationNames,
    driftCheck: "not_run_read_only_cli",
    resetRequired: warnings.length === 0 ? false : null,
    warnings,
  };
}

function buildCommandAvailability(scripts: Record<string, string>): Record<CommandName, boolean> {
  return Object.fromEntries(
    REQUIRED_COMMANDS.map((command) => [command, Object.prototype.hasOwnProperty.call(scripts, command)]),
  ) as Record<CommandName, boolean>;
}

function buildReadiness(
  commandAvailability: Record<CommandName, boolean>,
  migrations: MigrationSummary,
): MvpStatusOutput["readiness"] {
  const migrationReady = migrations.status === "ok";

  return {
    importScoringReady: migrationReady,
    observationReportsReady:
      migrationReady &&
      commandAvailability["token:observation"] &&
      commandAvailability["tokens:observation-gaps"],
    notificationManualRetryReady:
      migrationReady && commandAvailability["notification:retry:plan"],
    holderSnapshotLoopReady:
      migrationReady &&
      commandAvailability["holder:gaps:plan"] &&
      commandAvailability["holder:snapshot:show"],
    boundedWatchReady: false,
    checkpointReady: false,
    telegramLiveSendReady: false,
    schedulerReady: false,
    systemdReady: false,
  };
}

function buildBlockers(migrations: MigrationSummary): string[] {
  const blockers = [
    "Pro API parked",
    "paid holder source parked",
    "automatic source detection not yet validated for 3h/6h run",
    "scheduler/systemd not enabled",
  ];

  if (migrations.status === "warning") {
    blockers.push("migration or database status warning present");
  }

  return blockers;
}

export async function buildMvpStatusReport(): Promise<MvpStatusOutput> {
  const [
    tokenCount,
    metricCount,
    notificationCount,
    holderSnapshotCount,
    scripts,
    migrations,
  ] = await Promise.all([
    db.token.count(),
    db.metric.count(),
    db.notification.count(),
    db.holderSnapshot.count(),
    readPackageScripts(),
    buildMigrationSummary(),
  ]);

  const commandAvailability = buildCommandAvailability(scripts);
  const readiness = buildReadiness(commandAvailability, migrations);

  return {
    status: "ok",
    mode: "read_only_mvp_status",
    readOnly: true,
    willWrite: false,
    willFetch: false,
    willSendTelegram: false,
    database: {
      tokenCount,
      metricCount,
      notificationCount,
      holderSnapshotCount,
    },
    migrations,
    commandAvailability,
    readiness,
    blockers: buildBlockers(migrations),
    nearTermGoal: NEAR_TERM_GOAL,
    nextRecommendedSlice: NEXT_RECOMMENDED_SLICE,
  };
}

async function run(): Promise<void> {
  const report = await buildMvpStatusReport();
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
