import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBoundedOperationRunnerPlan,
  computeSinceMinutes,
  runBoundedOperationRunner,
  type BoundedOperationRunnerOptions,
  type BoundedOperationRunnerPhase,
  type PhaseCommand,
} from "../src/ops/boundedOperationRunner.ts";
import type {
  BoundedOperationPlannerInput,
  QueueSummary,
} from "../src/ops/boundedOperationPlanner.ts";

const BASE_OPTIONS: BoundedOperationRunnerOptions = {
  hours: 6,
  pumpOnly: true,
  checkpointFile: "/tmp/lowcap-bot-6h-pipeline.json",
  metricLimit: 50,
  enrichLimit: 50,
  intervalSeconds: 60,
  postRunBufferMinutes: 60,
  interItemDelayMs: 15_000,
  executeRequested: false,
  repoRoot: "/home/mochi/projects/lowcap-bot",
};

function queue(overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    sinceHours: 6,
    geckoOriginTokenCount: 0,
    metricPendingCount: 0,
    enrichPendingCount: 0,
    staleReviewCount: 0,
    notifyCandidateCount: 0,
    ...overrides,
  };
}

function input(overrides: Partial<BoundedOperationPlannerInput> = {}): BoundedOperationPlannerInput {
  const defaultWindow = queue({ sinceHours: 24 });
  const requestedWindow = queue();
  const rolling168h = queue({ sinceHours: 168 });

  return {
    dbState: {
      tokenCount: 0,
      metricCount: 0,
      notificationCount: 0,
      holderSnapshotCount: 0,
      metricZeroTokenCount: 0,
      metricOneTokenCount: 0,
      metricTwoPlusTokenCount: 0,
      notificationStatusCounts: {
        captured: 0,
        sent: 0,
        failed: 0,
      },
    },
    queueState: {
      defaultWindow,
      requestedWindow,
      rolling168h,
    },
    notificationState: {
      failedCount: 0,
      retryCandidateCount: 0,
      allowedAutoSendCandidateCount: 0,
    },
    queueStateAvailable: true,
    ...overrides,
  };
}

function allCommandText(report: ReturnType<typeof buildBoundedOperationRunnerPlan>): string {
  return report.phases.flatMap((phase) => phase.commandCandidates ?? []).join("\n");
}

test("plan-only mode marks phases planned and does not require execution", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(input(), BASE_OPTIONS, async (phase) => {
    calls.push(phase.phase);
    return { ok: true };
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.executeRequested, false);
  assert.deepEqual(calls, []);
  assert.equal(report.phases.find((phase) => phase.phase === "preflight")?.status, "ok");
  assert.equal(report.phases.find((phase) => phase.phase === "detect_write")?.status, "planned");
  assert.equal(report.phases.find((phase) => phase.phase === "metric_pending_snapshot")?.status, "planned");
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "planned");
});

test("computed sinceMinutes includes post-run buffer", () => {
  assert.equal(computeSinceMinutes({ hours: 6, postRunBufferMinutes: 60 }), 420);
  assert.equal(computeSinceMinutes({ hours: 1.5, postRunBufferMinutes: 30 }), 120);
});

test("command candidates include bounded pipeline safety flags", () => {
  const report = buildBoundedOperationRunnerPlan(input(), BASE_OPTIONS);
  const text = allCommandText(report);

  assert.match(text, /detect:geckoterminal:new-pools/);
  assert.match(text, /--watch/);
  assert.match(text, /--write/);
  assert.match(text, /--checkpointFile \/tmp\/lowcap-bot-6h-pipeline\.json/);
  assert.match(text, /metric:snapshot:geckoterminal/);
  assert.match(text, /--onlyMetricPending/);
  assert.match(text, /--noNotificationCapture/);
  assert.match(text, /--interItemDelayMs 15000/);
  assert.match(text, /token:enrich-rescore:geckoterminal/);
  assert.doesNotMatch(text, /--notify/);
  assert.doesNotMatch(text, /notification:send/);
  assert.doesNotMatch(text, /--live/);
});

test("failed notification blocks execution", () => {
  const report = buildBoundedOperationRunnerPlan(
    input({
      notificationState: {
        failedCount: 1,
        retryCandidateCount: 0,
        allowedAutoSendCandidateCount: 0,
      },
    }),
    { ...BASE_OPTIONS, executeRequested: true },
  );

  assert.ok(report.blockedBy.includes("failed_notifications_present"));
  assert.ok(report.stopConditionCodes.includes("failed_notifications_present"));
  assert.equal(report.phases.find((phase) => phase.phase === "detect_write")?.status, "blocked");
});

test("retry candidate blocks execution", () => {
  const report = buildBoundedOperationRunnerPlan(
    input({
      notificationState: {
        failedCount: 0,
        retryCandidateCount: 1,
        allowedAutoSendCandidateCount: 0,
      },
    }),
    { ...BASE_OPTIONS, executeRequested: true },
  );

  assert.ok(report.blockedBy.includes("retry_candidate_present"));
});

test("auto-send allowed candidate blocks execution", () => {
  const report = buildBoundedOperationRunnerPlan(
    input({
      notificationState: {
        failedCount: 0,
        retryCandidateCount: 0,
        allowedAutoSendCandidateCount: 1,
      },
    }),
    { ...BASE_OPTIONS, executeRequested: true },
  );

  assert.ok(report.blockedBy.includes("auto_send_allowed_candidate_present"));
});

test("checkpoint under repo is rejected", () => {
  const report = buildBoundedOperationRunnerPlan(input(), {
    ...BASE_OPTIONS,
    executeRequested: true,
    checkpointFile: "/home/mochi/projects/lowcap-bot/tmp/checkpoint.json",
  });

  assert.ok(report.blockedBy.includes("checkpoint_file_inside_repo"));
});

test("execute mode calls phases in order with mocks", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async (phase: BoundedOperationRunnerPhase, commands: PhaseCommand[]) => {
      calls.push(phase.phase);
      assert.ok(commands.length > 0);
      return { ok: true, summary: { mocked: true } };
    },
  );

  assert.equal(report.readOnly, false);
  assert.deepEqual(calls, [
    "detect_write",
    "metric_pending_snapshot",
    "enrich_rescore",
    "report_review",
    "notification_plan_review",
  ]);
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "executed");
});

test("detect failure stops metric and enrich", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async (phase) => {
      calls.push(phase.phase);
      return {
        ok: false,
        stopConditionCodes: ["mock_detect_failed"],
      };
    },
  );

  assert.deepEqual(calls, ["detect_write"]);
  assert.equal(report.phases.find((phase) => phase.phase === "detect_write")?.status, "failed");
  assert.equal(report.phases.find((phase) => phase.phase === "metric_pending_snapshot")?.status, "skipped");
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "skipped");
});

test("metric failure stops enrich", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async (phase) => {
      calls.push(phase.phase);
      return {
        ok: phase.phase !== "metric_pending_snapshot",
        stopConditionCodes:
          phase.phase === "metric_pending_snapshot" ? ["mock_metric_failed"] : [],
      };
    },
  );

  assert.deepEqual(calls, ["detect_write", "metric_pending_snapshot"]);
  assert.equal(report.phases.find((phase) => phase.phase === "metric_pending_snapshot")?.status, "failed");
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "skipped");
});

test("scheduler systemd retry and Telegram execution stay locked", () => {
  const report = buildBoundedOperationRunnerPlan(input(), BASE_OPTIONS);
  assert.equal(report.operationReadiness.schedulerUnlocked, false);
  assert.equal(report.operationReadiness.systemdUnlocked, false);
  assert.equal(report.operationReadiness.alwaysOnAutoSendUnlocked, false);
  assert.equal(report.operationReadiness.telegramLiveSendUnlocked, false);
  assert.equal(report.operationReadiness.retryExecutionUnlocked, false);
});
