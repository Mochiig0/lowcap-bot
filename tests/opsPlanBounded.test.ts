import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBoundedOperationPlan,
  type BoundedOperationPlannerInput,
  type BoundedOperationPlannerOptions,
  type QueueSummary,
} from "../src/ops/boundedOperationPlanner.ts";

const BASE_OPTIONS: BoundedOperationPlannerOptions = {
  hours: 6,
  sinceHours: 6,
  limit: 20,
  pumpOnly: true,
};

function queue(overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    sinceHours: 6,
    geckoOriginTokenCount: 0,
    metricPendingCount: 0,
    longitudinalMetricDueCount: 0,
    enrichPendingCount: 0,
    staleReviewCount: 0,
    notifyCandidateCount: 0,
    ...overrides,
  };
}

function input(overrides: Partial<BoundedOperationPlannerInput> = {}): BoundedOperationPlannerInput {
  const defaultWindow = queue({
    sinceHours: 24,
  });
  const requestedWindow = queue();
  const rolling168h = queue({
    sinceHours: 168,
  });

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

function withRequestedQueue(overrides: Partial<QueueSummary>): BoundedOperationPlannerInput {
  const base = input();
  return {
    ...base,
    queueState: {
      ...base.queueState,
      requestedWindow: queue(overrides),
    },
  };
}

test("queue clear recommends detect watch dry-run without write", () => {
  const result = buildBoundedOperationPlan(input(), BASE_OPTIONS);

  assert.equal(result.nextRecommendedStep, "detect_watch_dry_run");
  assert.equal(result.postRunPlan, undefined);
  assert.equal(result.humanApprovalRequired, false);
  assert.match(result.redCommandCandidate ?? "", /detect:geckoterminal:new-pools/);
  assert.doesNotMatch(result.redCommandCandidate ?? "", /--write/);
  assert.equal(result.operationReadiness.schedulerUnlocked, false);
  assert.equal(result.operationReadiness.systemdUnlocked, false);
  assert.equal(result.operationReadiness.alwaysOnAutoSendUnlocked, false);
});

test("metric pending recommends onlyMetricPending snapshot command", () => {
  const result = buildBoundedOperationPlan(
    withRequestedQueue({
      metricPendingCount: 3,
      geckoOriginTokenCount: 3,
    }),
    BASE_OPTIONS,
  );

  assert.equal(result.nextRecommendedStep, "metric_pending_snapshot");
  assert.equal(result.humanApprovalRequired, true);
  assert.match(result.redCommandCandidate ?? "", /metric:snapshot:geckoterminal/);
  assert.match(result.redCommandCandidate ?? "", /--write/);
  assert.match(result.redCommandCandidate ?? "", /--onlyMetricPending/);
  assert.match(result.redCommandCandidate ?? "", /--noNotificationCapture/);
});

test("enrich pending recommends enrich rescore command without notify", () => {
  const result = buildBoundedOperationPlan(
    withRequestedQueue({
      enrichPendingCount: 2,
      staleReviewCount: 2,
      geckoOriginTokenCount: 2,
    }),
    BASE_OPTIONS,
  );

  assert.equal(result.nextRecommendedStep, "enrich_pending_rescore");
  assert.equal(result.humanApprovalRequired, true);
  assert.match(result.redCommandCandidate ?? "", /token:enrich-rescore:geckoterminal/);
  assert.match(result.redCommandCandidate ?? "", /--interItemDelayMs 15000/);
  assert.match(result.redCommandCandidate ?? "", /--write/);
  assert.doesNotMatch(result.redCommandCandidate ?? "", /--notify/);
});

test("3h requested window does not hide rolling 168h enrich backlog", () => {
  const base = input();
  const result = buildBoundedOperationPlan(
    {
      ...base,
      queueState: {
        ...base.queueState,
        requestedWindow: queue({ sinceHours: 3 }),
        rolling168h: queue({
          sinceHours: 168,
          geckoOriginTokenCount: 179,
          enrichPendingCount: 130,
          staleReviewCount: 130,
        }),
      },
    },
    {
      ...BASE_OPTIONS,
      hours: 3,
      sinceHours: 3,
      postRunPlan: true,
    },
  );

  assert.equal(result.detectHorizonHours, 3);
  assert.equal(result.requestedQueueHorizonHours, 3);
  assert.equal(result.cleanupHorizonHours, 168);
  assert.equal(result.cleanupWindowSource, "rolling_168h_backlog");
  assert.equal(result.cleanupWindow.enrichPendingCount, 130);
  assert.equal(result.nextRecommendedStep, "enrich_pending_rescore");
  assert.match(result.redCommandCandidate ?? "", /--sinceMinutes 10080/);
  assert.equal(result.postRunPlan?.detectHorizonHours, 3);
  assert.equal(result.postRunPlan?.cleanupHorizonHours, 168);
  assert.equal(result.postRunPlan?.cleanupWindowSource, "rolling_168h_backlog");
  const enrichStep = result.postRunPlan?.steps.find(
    (step) => step.stepName === "enrich_pending_rescore",
  );
  assert.equal(enrichStep?.status, "ready");
  assert.match(enrichStep?.commandCandidate ?? "", /--sinceMinutes 10080/);
});

test("3h requested window does not hide rolling longitudinal Metric backlog", () => {
  const base = input();
  const result = buildBoundedOperationPlan(
    {
      ...base,
      queueState: {
        ...base.queueState,
        requestedWindow: queue({ sinceHours: 3 }),
        rolling168h: queue({
          sinceHours: 168,
          geckoOriginTokenCount: 50,
          longitudinalMetricDueCount: 50,
        }),
      },
    },
    {
      ...BASE_OPTIONS,
      hours: 3,
      sinceHours: 3,
      postRunPlan: true,
    },
  );

  assert.equal(result.detectHorizonHours, 3);
  assert.equal(result.cleanupHorizonHours, 168);
  assert.equal(result.cleanupWindowSource, "rolling_168h_backlog");
  assert.equal(result.cleanupWindow.longitudinalMetricDueCount, 50);
  assert.equal(result.nextRecommendedStep, "metric_longitudinal_snapshot");
  assert.match(result.redCommandCandidate ?? "", /--sinceMinutes 10080/);
  assert.match(result.redCommandCandidate ?? "", /--onlyMetricOnce/);
  assert.match(result.redCommandCandidate ?? "", /--minGapMinutes 60/);
  assert.match(result.redCommandCandidate ?? "", /--noNotificationCapture/);
  const longitudinalStep = result.postRunPlan?.steps.find(
    (step) => step.stepName === "metric_longitudinal_snapshot",
  );
  assert.equal(longitudinalStep?.status, "ready");
  assert.match(longitudinalStep?.commandCandidate ?? "", /--limit 50/);
  assert.match(longitudinalStep?.commandCandidate ?? "", /--onlyMetricOnce/);
  assert.equal(result.postRunPlan?.recommendedFirstStep, "metric_longitudinal_snapshot");
});

test("failed notification stops the planner", () => {
  const result = buildBoundedOperationPlan(
    input({
      notificationState: {
        failedCount: 1,
        retryCandidateCount: 0,
        allowedAutoSendCandidateCount: 0,
      },
    }),
    BASE_OPTIONS,
  );

  assert.equal(result.nextRecommendedStep, "stop_due_to_failed_notifications");
  assert.equal(result.redCommandCandidate, null);
  assert.ok(result.blockedBy.includes("failed_notifications_present"));
  assert.ok(result.stopConditionCodes.includes("failed_notifications_present"));
});

test("retry candidate stops with ambiguous state", () => {
  const result = buildBoundedOperationPlan(
    input({
      notificationState: {
        failedCount: 0,
        retryCandidateCount: 1,
        allowedAutoSendCandidateCount: 0,
      },
    }),
    BASE_OPTIONS,
  );

  assert.equal(result.nextRecommendedStep, "stop_due_to_ambiguous_state");
  assert.equal(result.redCommandCandidate, null);
  assert.ok(result.blockedBy.includes("retry_candidate_present"));
});

test("auto-send candidate routes to plan review without execution", () => {
  const result = buildBoundedOperationPlan(
    input({
      notificationState: {
        failedCount: 0,
        retryCandidateCount: 0,
        allowedAutoSendCandidateCount: 1,
      },
    }),
    BASE_OPTIONS,
  );

  assert.equal(result.nextRecommendedStep, "auto_send_plan_review");
  assert.equal(result.redCommandCandidate, null);
  assert.ok(result.blockedBy.includes("auto_send_allowed_candidate_present"));
  assert.equal(result.operationReadiness.canRunAutoSendSingleShot, false);
});

test("stale-only queue recommends report review", () => {
  const result = buildBoundedOperationPlan(
    withRequestedQueue({
      staleReviewCount: 4,
      geckoOriginTokenCount: 4,
    }),
    BASE_OPTIONS,
  );

  assert.equal(result.nextRecommendedStep, "report_review");
  assert.equal(result.redCommandCandidate, null);
});

test("post-run plan adds metric workflow with limit 50 without changing next step", () => {
  const result = buildBoundedOperationPlan(
    withRequestedQueue({
      metricPendingCount: 339,
      enrichPendingCount: 359,
      geckoOriginTokenCount: 359,
    }),
    {
      ...BASE_OPTIONS,
      postRunPlan: true,
    },
  );

  assert.equal(result.nextRecommendedStep, "metric_pending_snapshot");
  assert.equal(result.redCommandCandidate?.includes("--limit 20"), true);
  assert.equal(result.postRunPlan?.recommendedFirstStep, "metric_pending_snapshot");

  const metricStep = result.postRunPlan?.steps.find(
    (step) => step.stepName === "metric_pending_snapshot",
  );
  assert.equal(metricStep?.status, "ready");
  assert.match(metricStep?.commandCandidate ?? "", /--limit 50/);
  assert.match(metricStep?.commandCandidate ?? "", /--onlyMetricPending/);
  assert.match(metricStep?.commandCandidate ?? "", /--noNotificationCapture/);
  assert.equal(metricStep?.humanApprovalRequired, true);

  const enrichStep = result.postRunPlan?.steps.find(
    (step) => step.stepName === "enrich_pending_rescore",
  );
  assert.equal(enrichStep?.status, "pending_previous_step");
  assert.equal(enrichStep?.commandCandidate, null);
});

test("post-run plan makes enrich ready after metric pending is clear", () => {
  const result = buildBoundedOperationPlan(
    withRequestedQueue({
      metricPendingCount: 0,
      enrichPendingCount: 5,
      geckoOriginTokenCount: 5,
    }),
    {
      ...BASE_OPTIONS,
      postRunPlan: true,
    },
  );

  assert.equal(result.nextRecommendedStep, "enrich_pending_rescore");
  assert.equal(result.postRunPlan?.recommendedFirstStep, "enrich_pending_rescore");

  const enrichStep = result.postRunPlan?.steps.find(
    (step) => step.stepName === "enrich_pending_rescore",
  );
  assert.equal(enrichStep?.status, "ready");
  assert.match(enrichStep?.commandCandidate ?? "", /token:enrich-rescore:geckoterminal/);
  assert.match(enrichStep?.commandCandidate ?? "", /--limit 50/);
  assert.match(enrichStep?.commandCandidate ?? "", /--interItemDelayMs 15000/);
  assert.match(enrichStep?.commandCandidate ?? "", /--onlyMetricCovered/);
  assert.match(enrichStep?.commandCandidate ?? "", /--write/);
  assert.doesNotMatch(enrichStep?.commandCandidate ?? "", /--notify/);
});

test("post-run plan makes report review ready when only stale review remains", () => {
  const result = buildBoundedOperationPlan(
    withRequestedQueue({
      staleReviewCount: 4,
      geckoOriginTokenCount: 4,
    }),
    {
      ...BASE_OPTIONS,
      postRunPlan: true,
    },
  );

  assert.equal(result.postRunPlan?.recommendedFirstStep, "report_review");

  const reportStep = result.postRunPlan?.steps.find(
    (step) => step.stepName === "report_review",
  );
  assert.equal(reportStep?.status, "ready");
  assert.match(reportStep?.commandCandidate ?? "", /review:queue:geckoterminal/);
  assert.equal(reportStep?.humanApprovalRequired, false);
});

test("post-run plan stops workflow on failed notification", () => {
  const result = buildBoundedOperationPlan(
    input({
      notificationState: {
        failedCount: 1,
        retryCandidateCount: 0,
        allowedAutoSendCandidateCount: 0,
      },
    }),
    {
      ...BASE_OPTIONS,
      postRunPlan: true,
    },
  );

  assert.equal(result.nextRecommendedStep, "stop_due_to_failed_notifications");
  assert.equal(result.postRunPlan?.recommendedFirstStep, "stop_due_to_failed_notifications");
  assert.equal(
    result.postRunPlan?.steps.every((step) => step.status === "blocked"),
    true,
  );
});

test("post-run plan reports queue clear and next write rehearsal candidate", () => {
  const result = buildBoundedOperationPlan(input(), {
    ...BASE_OPTIONS,
    postRunPlan: true,
  });

  assert.equal(result.nextRecommendedStep, "detect_watch_dry_run");
  assert.equal(result.postRunPlan?.recommendedFirstStep, "no_action_queue_clear");
  assert.equal(result.postRunPlan?.workflowComplete, true);

  const clearStep = result.postRunPlan?.steps[0];
  assert.equal(clearStep?.stepName, "no_action_queue_clear");
  assert.equal(clearStep?.status, "ready");
  assert.match(clearStep?.commandCandidate ?? "", /detect:geckoterminal:new-pools/);
  assert.match(clearStep?.commandCandidate ?? "", /--write/);
  assert.equal(clearStep?.humanApprovalRequired, true);
});
