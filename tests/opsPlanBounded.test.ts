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
  assert.match(result.redCommandCandidate ?? "", /--write/);
  assert.doesNotMatch(result.redCommandCandidate ?? "", /--notify/);
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
