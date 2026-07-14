import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildBoundedOperationRunnerPlan,
  computeSinceMinutes,
  formatBoundedOperationProgressEvent,
  runBoundedOperationRunner,
  type BoundedOperationRunnerProgressEvent,
  type BoundedOperationRunnerOptions,
  type BoundedOperationRunnerPhase,
  type BoundedOperationRunnerExecutionContext,
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

function captureProgressEvents(): {
  events: BoundedOperationRunnerProgressEvent[];
  logger: (event: BoundedOperationRunnerProgressEvent) => void;
} {
  const events: BoundedOperationRunnerProgressEvent[] = [];
  return {
    events,
    logger: (event) => {
      events.push(event);
    },
  };
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

test("operator cycle preset selects the one-command 3h bounded shape", () => {
  const parsed = parseOpsRunBoundedArgs(["--operatorCycle", "--plan"]);
  assert.equal(parsed.hours, 3);
  assert.equal(parsed.pumpOnly, true);
  assert.equal(parsed.checkpointFile, "/tmp/lowcap-bot-gecko-bounded-write-rehearsal.json");
  assert.equal(parsed.metricLimit, 50);
  assert.equal(parsed.enrichLimit, 50);
  assert.equal(parsed.postRunMetricCycles, 4);
  assert.equal(parsed.postRunEnrichCycles, 4);
  assert.equal(parsed.intervalSeconds, 60);
  assert.equal(parsed.interItemDelayMs, 15_000);
  assert.equal(parsed.executeRequested, false);
  assert.equal(parsed.planRequested, true);
});

test("plan and execute flags are mutually exclusive regardless of order", () => {
  assert.throws(
    () => parseOpsRunBoundedArgs(["--plan", "--execute"]),
    /cannot be combined/,
  );
  assert.throws(
    () => parseOpsRunBoundedArgs(["--execute", "--plan"]),
    /cannot be combined/,
  );
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
  assert.match(text, /--onlyMetricCovered/);
  assert.match(text, /metrics:growth-report/);
  assert.match(text, /bounded:watch:readiness/);
  assert.match(text, /ops:plan:bounded/);
  assert.doesNotMatch(text, /--notify/);
  assert.doesNotMatch(text, /notification:send/);
  assert.doesNotMatch(text, /--live/);
});

test("execute mode uses node import tsx for write phase execution commands", async () => {
  const commandsByPhase: Record<string, PhaseCommand[]> = {};
  await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async (phase, commands) => {
      commandsByPhase[phase.phase] = commands;
      if (phase.phase === "metric_pending_snapshot") {
        return { ok: true, summary: { selected: 1, written: 1 } };
      }
      if (phase.phase === "enrich_rescore") {
        return { ok: true, summary: { selected: 1, enriched: 1, rescored: 1 } };
      }
      return { ok: true, summary: { selected: 1 } };
    },
  );

  const detectCommand = commandsByPhase.detect_write?.[0];
  const metricCommand = commandsByPhase.metric_pending_snapshot?.[0];
  const enrichCommand = commandsByPhase.enrich_rescore?.[0];

  assert.equal(detectCommand?.file, process.execPath);
  assert.equal(metricCommand?.file, process.execPath);
  assert.equal(enrichCommand?.file, process.execPath);

  assert.deepEqual(detectCommand?.args.slice(0, 2), ["--import", "tsx"]);
  assert.deepEqual(metricCommand?.args.slice(0, 2), ["--import", "tsx"]);
  assert.deepEqual(enrichCommand?.args.slice(0, 2), ["--import", "tsx"]);

  assert.match(String(detectCommand?.args[2]), /src\/cli\/detectGeckoterminalNewPools\.ts$/);
  assert.match(String(metricCommand?.args[2]), /src\/cli\/metricSnapshotGeckoterminal\.ts$/);
  assert.match(String(enrichCommand?.args[2]), /src\/cli\/tokenEnrichRescoreGeckoterminal\.ts$/);
  assert.ok(enrichCommand?.args.includes("--onlyMetricCovered"));

  assert.notEqual(detectCommand?.file, "pnpm");
  assert.notEqual(metricCommand?.file, "pnpm");
  assert.notEqual(enrichCommand?.file, "pnpm");
});

test("plan-only keeps operator-facing pnpm command candidates", () => {
  const report = buildBoundedOperationRunnerPlan(input(), BASE_OPTIONS);
  const text = allCommandText(report);

  assert.match(text, /pnpm -s detect:geckoterminal:new-pools/);
  assert.match(text, /pnpm -s metric:snapshot:geckoterminal/);
  assert.match(text, /pnpm -s token:enrich-rescore:geckoterminal/);
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

test("report phase runs queue growth readiness planner and notification plans only", async () => {
  const commandsByPhase: Record<string, PhaseCommand[]> = {};
  await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async (phase, commands) => {
      commandsByPhase[phase.phase] = commands;
      if (phase.phase === "metric_pending_snapshot") {
        return { ok: true, summary: { selected: 1, written: 1 } };
      }
      if (phase.phase === "enrich_rescore") {
        return { ok: true, summary: { selected: 1, enriched: 1, rescored: 1 } };
      }
      return { ok: true, summary: { selected: 1 } };
    },
  );

  const reportLabels = commandsByPhase.report_review?.map((command) => command.label);
  const notificationLabels = commandsByPhase.notification_plan_review?.map((command) => command.label);

  assert.deepEqual(reportLabels, [
    "review_queue_default",
    "review_queue_168h",
    "metrics_growth_report",
    "bounded_watch_readiness",
    "bounded_next_step_planner",
  ]);
  assert.deepEqual(notificationLabels, [
    "notification_auto_send_plan",
    "notification_auto_send_plan_enabled",
    "notification_retry_plan",
  ]);
  assert.equal(
    [...(commandsByPhase.report_review ?? []), ...(commandsByPhase.notification_plan_review ?? [])]
      .some((command) => command.commandCandidate.includes("notification:auto-send:execute")),
    false,
  );
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
      if (phase.phase === "metric_pending_snapshot") {
        return { ok: true, summary: { selected: 1, written: 1 } };
      }
      if (phase.phase === "enrich_rescore") {
        return { ok: true, summary: { selected: 1, enriched: 1, rescored: 1 } };
      }
      return { ok: true, summary: { selected: 1 } };
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

test("execute mode emits phase cycle and final progress events", async () => {
  const { events, logger } = captureProgressEvents();
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 2,
      postRunEnrichCycles: 2,
    },
    async (phase) => {
      if (phase.phase === "detect_write") {
        return { ok: true, summary: { importedCount: 3, existingCount: 1 } };
      }
      if (phase.phase === "metric_pending_snapshot") {
        return { ok: true, summary: { selected: 1, written: 1, skipped: 0, error: 0 } };
      }
      if (phase.phase === "enrich_rescore") {
        return { ok: true, summary: { selected: 1, enriched: 1, rescored: 1, error: 0 } };
      }
      return { ok: true, summary: { selected: 0 } };
    },
    logger,
  );

  assert.ok(events.some((event) =>
    event.event === "phase" && event.phase === "detect_write" && event.status === "started",
  ));
  assert.ok(events.some((event) =>
    event.event === "phase" && event.phase === "detect_write" && event.status === "completed",
  ));
  assert.ok(events.some((event) =>
    event.event === "cycle"
    && event.phase === "metric_pending_snapshot"
    && event.cycleIndex === 1
    && event.cycleTotal === 2
    && event.status === "completed",
  ));
  assert.ok(events.some((event) =>
    event.event === "cycle"
    && event.phase === "enrich_rescore"
    && event.cycleIndex === 2
    && event.cycleTotal === 2
    && event.status === "completed",
  ));

  const finalEvent = events.find((event) => event.event === "final_summary");
  assert.equal(finalEvent?.status, "completed");
  assert.equal(finalEvent?.summary?.totalTokenCreateReuse, 4);
  assert.equal(finalEvent?.summary?.totalMetricWrite, 2);
  assert.equal(finalEvent?.summary?.totalTokenUpdate, 2);
  assert.equal(report.progressSummary?.overallStatus, "completed");
  assert.equal(report.progressSummary?.metricCyclesExecuted, 2);
  assert.equal(report.progressSummary?.enrichCyclesExecuted, 2);
  assert.equal(report.operatorSummary?.overallStatus, "completed");
  assert.equal(report.operatorSummary?.detect.imported, 3);
  assert.equal(report.operatorSummary?.detect.existing, 1);
  assert.equal(report.operatorSummary?.metric.written, 2);
  assert.equal(report.operatorSummary?.enrich.updated, 2);
  assert.equal(report.operatorSummary?.telegramSendCount, 0);
});

test("plan-only mode does not emit progress events", async () => {
  const { events, logger } = captureProgressEvents();
  const report = await runBoundedOperationRunner(
    input(),
    BASE_OPTIONS,
    async () => ({ ok: true }),
    logger,
  );

  assert.deepEqual(events, []);
  assert.equal(report.operatorSummary?.overallStatus, "planned");
  assert.equal(report.operatorSummary?.deltas.token, 0);
  assert.equal(report.operatorSummary?.deltas.metric, 0);
  assert.equal(report.operatorSummary?.telegramSendCount, 0);
});

test("final progress summary is emitted on detect failure", async () => {
  const { events, logger } = captureProgressEvents();
  const report = await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async (phase) => ({
      ok: phase.phase !== "detect_write",
      stopConditionCodes: phase.phase === "detect_write" ? ["mock_detect_failed"] : [],
    }),
    logger,
  );

  const finalEvent = events.find((event) => event.event === "final_summary");
  assert.equal(finalEvent?.status, "failed");
  assert.ok(finalEvent?.stopConditionCodes?.includes("mock_detect_failed"));
  assert.equal(report.progressSummary?.overallStatus, "failed");
});

test("interrupted detect phase emits interrupted final summary and skips post-run phases", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-bounded-interrupt-"));
  const checkpointFile = join(dir, "checkpoint.json");
  await writeFile(
    checkpointFile,
    JSON.stringify({
      source: "geckoterminal.new_pools",
      cursor: {
        poolCreatedAt: "2026-06-05T04:51:00.000Z",
        poolAddress: "123456789ABCDEFGH",
      },
    }),
    "utf8",
  );
  const { events, logger } = captureProgressEvents();
  const calls: string[] = [];

  try {
    const report = await runBoundedOperationRunner(
      input({
        dbState: {
          tokenCount: 10,
          metricCount: 20,
          notificationCount: 1,
          holderSnapshotCount: 0,
          metricZeroTokenCount: 5,
          metricOneTokenCount: 4,
          metricTwoPlusTokenCount: 1,
          notificationStatusCounts: {
            captured: 1,
            sent: 0,
            failed: 0,
          },
        },
      }),
      { ...BASE_OPTIONS, checkpointFile, executeRequested: true },
      async (
        phase: BoundedOperationRunnerPhase,
        _commands: PhaseCommand[],
        context?: BoundedOperationRunnerExecutionContext,
      ) => {
        calls.push(phase.phase);
        context?.requestInterrupt("SIGINT");
        return {
          ok: false,
          interrupted: true,
          summary: {
            importedCount: 3,
            existingCount: 1,
            rawJson: "RAW_JSON_SHOULD_NOT_BE_LOGGED",
          },
          blockedBy: ["manual_interrupt"],
          stopConditionCodes: ["manual_interrupt"],
        };
      },
      logger,
    );

    const finalEvent = events.find((event) => event.event === "final_summary");
    assert.equal(report.status, "interrupted");
    assert.equal(report.progressSummary?.overallStatus, "interrupted");
    assert.equal(report.progressSummary?.activePhase, "detect_write");
    assert.equal(report.progressSummary?.partialPhase, "detect_write");
    assert.deepEqual(report.progressSummary?.phasesCompleted, ["preflight"]);
    assert.ok(report.progressSummary?.phasesSkipped.includes("metric_pending_snapshot"));
    assert.ok(report.progressSummary?.phasesSkipped.includes("enrich_rescore"));
    assert.ok(report.stopConditionCodes.includes("manual_interrupt"));
    assert.equal(report.checkpointFile, checkpointFile);
    assert.equal(report.checkpointExists, true);
    assert.equal(report.checkpointSafeCursorSummary?.poolCreatedAt, "2026-06-05T04:51:00.000Z");
    assert.equal(report.progressSummary?.notificationCreateUpdateExpected, 0);
    assert.equal(report.progressSummary?.telegramSendExpected, 0);
    assert.deepEqual(calls, ["detect_write"]);
    assert.equal(finalEvent?.status, "interrupted");
    assert.equal(finalEvent?.summary?.activePhase, "detect_write");
    assert.equal(finalEvent?.summary?.checkpointFile, checkpointFile);
    const rendered = events.map(formatBoundedOperationProgressEvent).join("\n");
    assert.doesNotMatch(rendered, /RAW_JSON_SHOULD_NOT_BE_LOGGED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("interrupted metric cycle stops remaining metric cycles and later phases", async () => {
  const { events, logger } = captureProgressEvents();
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 3,
      postRunEnrichCycles: 2,
    },
    async (phase, commands, context) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      if (phase.phase === "metric_pending_snapshot") {
        context?.requestInterrupt("SIGTERM");
        return {
          ok: false,
          interrupted: true,
          summary: { selected: 1, written: 0 },
          blockedBy: ["manual_interrupt"],
          stopConditionCodes: ["manual_interrupt"],
        };
      }
      return { ok: true, summary: { selected: 1, written: 1 } };
    },
    logger,
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
  ]);
  assert.equal(report.status, "interrupted");
  assert.equal(report.metricCyclesExecuted, 0);
  assert.equal(report.metricCyclesStoppedReason, "manual_interrupt");
  assert.equal(report.progressSummary?.activePhase, "metric_pending_snapshot");
  assert.equal(report.progressSummary?.activeCycleIndex, 1);
  assert.equal(report.progressSummary?.activeCycleTotal, 3);
  assert.equal(report.phases.find((phase) => phase.phase === "enrich_rescore")?.status, "skipped");
  assert.equal(report.phases.find((phase) => phase.phase === "report_review")?.status, "skipped");
  assert.equal(events.find((event) => event.event === "final_summary")?.status, "interrupted");
});

test("interrupted enrich cycle stops remaining enrich cycles and review phases", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 1,
      postRunEnrichCycles: 3,
    },
    async (phase, commands, context) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      if (phase.phase === "enrich_rescore") {
        context?.requestInterrupt("SIGINT");
        return {
          ok: false,
          interrupted: true,
          summary: { selected: 1, enriched: 0, rescored: 0 },
          blockedBy: ["manual_interrupt"],
          stopConditionCodes: ["manual_interrupt"],
        };
      }
      return {
        ok: true,
        summary:
          phase.phase === "metric_pending_snapshot"
            ? { selected: 1, written: 1 }
            : { selected: 1, enriched: 1, rescored: 1 },
      };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
    "enrich_rescore:enrich_rescore_cycle_1",
  ]);
  assert.equal(report.status, "interrupted");
  assert.equal(report.enrichCyclesExecuted, 0);
  assert.equal(report.enrichCyclesStoppedReason, "manual_interrupt");
  assert.equal(report.progressSummary?.activePhase, "enrich_rescore");
  assert.equal(report.progressSummary?.activeCycleIndex, 1);
  assert.equal(report.progressSummary?.activeCycleTotal, 3);
  assert.equal(report.phases.find((phase) => phase.phase === "report_review")?.status, "skipped");
  assert.equal(report.phases.find((phase) => phase.phase === "notification_plan_review")?.status, "skipped");
});

test("final progress summary is emitted on metric failure", async () => {
  const { events, logger } = captureProgressEvents();
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 2,
      postRunEnrichCycles: 1,
    },
    async (phase) => {
      if (phase.phase === "metric_pending_snapshot") {
        return {
          ok: false,
          summary: { selected: 1, written: 0, error: 1 },
          stopConditionCodes: ["mock_metric_failed"],
        };
      }
      return { ok: true, summary: { selected: 1, written: 1, enriched: 1, rescored: 1 } };
    },
    logger,
  );

  const finalEvent = events.find((event) => event.event === "final_summary");
  assert.equal(finalEvent?.status, "failed");
  assert.equal(report.progressSummary?.overallStatus, "failed");
  assert.equal(report.metricCyclesExecuted, 0);
});

test("final progress summary is emitted on enrich failure", async () => {
  const { events, logger } = captureProgressEvents();
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 1,
      postRunEnrichCycles: 2,
    },
    async (phase) => {
      if (phase.phase === "enrich_rescore") {
        return {
          ok: false,
          summary: { selected: 1, enriched: 0, rescored: 0, error: 1 },
          stopConditionCodes: ["mock_enrich_failed"],
        };
      }
      return { ok: true, summary: { selected: 1, written: 1, enriched: 1, rescored: 1 } };
    },
    logger,
  );

  const finalEvent = events.find((event) => event.event === "final_summary");
  assert.equal(finalEvent?.status, "failed");
  assert.equal(report.progressSummary?.overallStatus, "failed");
  assert.equal(report.enrichCyclesExecuted, 0);
});

test("progress logs avoid raw payload fields", async () => {
  const { events, logger } = captureProgressEvents();
  await runBoundedOperationRunner(
    input(),
    { ...BASE_OPTIONS, executeRequested: true },
    async () => ({
      ok: true,
      summary: {
        selected: 1,
        written: 1,
        enriched: 1,
        rescored: 1,
        rawJson: "RAW_JSON_SHOULD_NOT_BE_LOGGED",
        stdoutTail: "STDOUT_TAIL_SHOULD_NOT_BE_LOGGED",
        offensiveText: "OFFENSIVE_TEXT_SHOULD_NOT_BE_LOGGED",
      },
    }),
    logger,
  );

  const rendered = events.map(formatBoundedOperationProgressEvent).join("\n");
  assert.doesNotMatch(rendered, /RAW_JSON_SHOULD_NOT_BE_LOGGED/);
  assert.doesNotMatch(rendered, /STDOUT_TAIL_SHOULD_NOT_BE_LOGGED/);
  assert.doesNotMatch(rendered, /OFFENSIVE_TEXT_SHOULD_NOT_BE_LOGGED/);
  assert.doesNotMatch(rendered, /rawJson/);
  assert.doesNotMatch(rendered, /stdoutTail/);
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

test("unexpected Token write signal in metric phase fails and skips enrich", async () => {
  const calls: string[] = [];
  const report = await runBoundedOperationRunner(
    input(),
    {
      ...BASE_OPTIONS,
      executeRequested: true,
      postRunMetricCycles: 2,
      postRunEnrichCycles: 1,
    },
    async (phase, commands) => {
      calls.push(`${phase.phase}:${commands[0]?.label}`);
      if (phase.phase === "metric_pending_snapshot") {
        return {
          ok: true,
          summary: { selectedCount: 1, okCount: 1, writtenCount: 1, tokenWriteCount: 1 },
        };
      }
      return { ok: true, summary: { selected: 1 } };
    },
  );

  assert.deepEqual(calls, [
    "detect_write:detect_write",
    "metric_pending_snapshot:metric_pending_snapshot_cycle_1",
  ]);
  assert.equal(report.metricCyclesStoppedReason, "unexpected_metric_phase_side_effect");
  assert.ok(report.stopConditionCodes.includes("unexpected_metric_phase_side_effect"));
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
