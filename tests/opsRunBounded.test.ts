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
import { parseOpsRunBoundedArgs } from "../src/cli/opsRunBounded.ts";
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
  postRunMetricCycles: 1,
  postRunEnrichCycles: 1,
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

test("default post-run cycles are one metric cycle and one enrich cycle", () => {
  const parsed = parseOpsRunBoundedArgs([]);
  assert.equal(parsed.postRunMetricCycles, 1);
  assert.equal(parsed.postRunEnrichCycles, 1);
});

test("post-run cycle options parse non-negative integers", () => {
  const parsed = parseOpsRunBoundedArgs([
    "--postRunMetricCycles",
    "3",
    "--postRunEnrichCycles",
    "2",
  ]);

  assert.equal(parsed.postRunMetricCycles, 3);
  assert.equal(parsed.postRunEnrichCycles, 2);
});

test("invalid post-run cycle options are rejected", () => {
  assert.throws(
    () => parseOpsRunBoundedArgs(["--postRunMetricCycles", "-1"]),
    /Invalid non-negative integer/,
  );
  assert.throws(
    () => parseOpsRunBoundedArgs(["--postRunEnrichCycles", "not-a-number"]),
    /Invalid non-negative integer/,
  );
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

test("plan-only output shows requested post-run cycles without executing them", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      postRunMetricCycles: 3,
      postRunEnrichCycles: 2,
    },
    async (phase) => {
      calls.push(phase.phase);
      return { ok: true };
    },
  );
  const metricPhase = report.phases.find((phase) => phase.phase === "metric_pending_snapshot");
  const enrichPhase = report.phases.find((phase) => phase.phase === "enrich_rescore");

  assert.deepEqual(calls, []);
  assert.equal(report.postRunMetricCycles, 3);
  assert.equal(report.postRunEnrichCycles, 2);
  assert.equal(metricPhase?.summary.cyclesPlanned, 3);
  assert.equal(enrichPhase?.summary.cyclesPlanned, 2);
  assert.equal(metricPhase?.commandCandidates?.length, 3);
  assert.equal(enrichPhase?.commandCandidates?.length, 2);
});

test("zero post-run cycles skip the corresponding phases", () => {
  const report = buildBoundedOperationRunnerPlan(input(), {
    ...BASE_OPTIONS,
    postRunMetricCycles: 0,
    postRunEnrichCycles: 0,
  });
  const metricPhase = report.phases.find((phase) => phase.phase === "metric_pending_snapshot");
  const enrichPhase = report.phases.find((phase) => phase.phase === "enrich_rescore");

  assert.equal(metricPhase?.status, "skipped");
  assert.equal(enrichPhase?.status, "skipped");
  assert.equal(metricPhase?.summary.stoppedReason, "cycles_zero");
  assert.equal(enrichPhase?.summary.stoppedReason, "cycles_zero");
});

test("provider or rate-limit cycle summary stops remaining write cycles", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 3,
      postRunEnrichCycles: 1,
    },
    async (phase, commands) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      if (phase.phase === "metric_pending_snapshot") {
        return {
          ok: true,
          summary: { selected: 1, written: 0, error: 1, http429Present: true },
        };
      }
      return { ok: true, summary: { selected: 1 } };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
  ]);
  assert.equal(report.metricCyclesStoppedReason, "provider_or_rate_limit_error");
  assert.ok(report.stopConditionCodes.includes("provider_or_rate_limit_error"));
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "skipped");
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

test("execute mode calls metric and enrich cycles the requested number of times", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 3,
      postRunEnrichCycles: 2,
    },
    async (phase: BoundedOperationRunnerPhase, commands: PhaseCommand[]) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      return { ok: true, summary: { selected: 1, written: 1, enriched: 1, rescored: 1 } };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_2",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_3",
    "enrich_rescore:enrich_rescore_cycle_1",
    "enrich_rescore:enrich_rescore_cycle_2",
    "report_review:review_queue_default",
    "notification_plan_review:notification_auto_send_plan",
  ]);
  assert.equal(report.metricCyclesExecuted, 3);
  assert.equal(report.enrichCyclesExecuted, 2);
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

test("metric cycle failure stops remaining metric cycles and enrich phase", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 3,
      postRunEnrichCycles: 2,
    },
    async (phase, commands) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      return {
        ok: phase.phase !== "metric_pending_snapshot",
        stopConditionCodes:
          phase.phase === "metric_pending_snapshot" ? ["mock_metric_failed"] : [],
      };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
  ]);
  assert.equal(report.metricCyclesExecuted, 0);
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "skipped");
});

test("enrich cycle failure stops remaining enrich cycles", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 1,
      postRunEnrichCycles: 3,
    },
    async (phase, commands) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      return {
        ok: phase.phase !== "enrich_rescore",
        summary: { selected: 1, written: 1 },
        stopConditionCodes:
          phase.phase === "enrich_rescore" ? ["mock_enrich_failed"] : [],
      };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
    "enrich_rescore:enrich_rescore_cycle_1",
  ]);
  assert.equal(report.enrichCyclesExecuted, 0);
  assert.equal(report.phases.find((phase) => phase.phase === "report_review")?.status, "skipped");
});

test("selected or written zero stops remaining cycles without generating notification sends", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 3,
      postRunEnrichCycles: 1,
    },
    async (phase, commands) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      if (phase.phase === "metric_pending_snapshot") {
        return { ok: true, summary: { selected: 0, written: 0, skipped: 0, error: 0 } };
      }
      return { ok: true, summary: { selected: 1, enriched: 1, rescored: 1 } };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
    "enrich_rescore:enrich_rescore_cycle_1",
    "report_review:review_queue_default",
    "notification_plan_review:notification_auto_send_plan",
  ]);
  assert.equal(report.metricCyclesStoppedReason, "selected_zero");
  assert.equal(allCommandText(report).includes("notification:send"), false);
});

test("scheduler systemd retry and Telegram execution stay locked", () => {
  const report = buildBoundedOperationRunnerPlan(input(), BASE_OPTIONS);
  assert.equal(report.operationReadiness.schedulerUnlocked, false);
  assert.equal(report.operationReadiness.systemdUnlocked, false);
  assert.equal(report.operationReadiness.alwaysOnAutoSendUnlocked, false);
  assert.equal(report.operationReadiness.telegramLiveSendUnlocked, false);
  assert.equal(report.operationReadiness.retryExecutionUnlocked, false);
});
