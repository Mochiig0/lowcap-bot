import { pathToFileURL } from "node:url";

import type { Notification, PrismaClient } from "@prisma/client";

import { db } from "./db.js";
import {
  countNotificationRetryCandidates,
  findNextNotificationRetryCandidate,
} from "../notifications/notificationRepository.js";

type NotificationClient = Pick<PrismaClient, "notification">;

type SideEffectUpperBoundSpec = {
  telegramSendMax: 0 | 1;
  notificationUpdateMax: 0 | 1;
  notificationCreateMax: 0;
  tokenWriteMax: 0;
  metricWriteMax: 0;
  checkpointWrite: false;
  queue: false;
  systemd: false;
};

type SelectedRetryCandidate = {
  notificationKey: string;
  eventType: "metric_appended";
  mint: string;
  metricId: number;
  status: "failed";
  mode: "live_send";
  failedAt: string | null;
  errorCode: string | null;
};

export type NotificationRetryPlanResult = {
  status: "ok" | "stop";
  mode: "read_only_retry_planner";
  willExecute: false;
  executor: "human" | "none";
  requiresHumanApproval: boolean;
  candidateCount: number;
  selectedCount: 0 | 1;
  selected: SelectedRetryCandidate | null;
  nextRedCommand: string | null;
  sideEffectUpperBoundSpec: SideEffectUpperBoundSpec;
  stopConditionCodes: string[];
};

const NO_SIDE_EFFECTS_SPEC: SideEffectUpperBoundSpec = {
  telegramSendMax: 0,
  notificationUpdateMax: 0,
  notificationCreateMax: 0,
  tokenWriteMax: 0,
  metricWriteMax: 0,
  checkpointWrite: false,
  queue: false,
  systemd: false,
};

const RED_COMMAND_SIDE_EFFECT_SPEC: SideEffectUpperBoundSpec = {
  telegramSendMax: 1,
  notificationUpdateMax: 1,
  notificationCreateMax: 0,
  tokenWriteMax: 0,
  metricWriteMax: 0,
  checkpointWrite: false,
  queue: false,
  systemd: false,
};

function shellArg(value: string): string {
  if (/^[A-Za-z0-9:_./=-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildNextRedCommand(notificationKey: string): string {
  return [
    "pnpm -s notification:send -- --notificationKey",
    shellArg(notificationKey),
    "--trigger metric_appended --live --retryFailed",
  ].join(" ");
}

function toSelectedCandidate(notification: Notification): SelectedRetryCandidate {
  if (notification.metricId === null) {
    throw new Error("Invariant violation: selected retry candidate is missing metricId");
  }

  return {
    notificationKey: notification.notificationKey,
    eventType: "metric_appended",
    mint: notification.mint,
    metricId: notification.metricId,
    status: "failed",
    mode: "live_send",
    failedAt: notification.failedAt?.toISOString() ?? null,
    errorCode: notification.errorCode,
  };
}

export async function buildNotificationRetryPlan(
  client: NotificationClient,
): Promise<NotificationRetryPlanResult> {
  const now = new Date();
  const [candidateCount, selected] = await Promise.all([
    countNotificationRetryCandidates(client, {
      now,
    }),
    findNextNotificationRetryCandidate(client, {
      now,
    }),
  ]);

  if (!selected) {
    return {
      status: "stop",
      mode: "read_only_retry_planner",
      willExecute: false,
      executor: "none",
      requiresHumanApproval: false,
      candidateCount,
      selectedCount: 0,
      selected: null,
      nextRedCommand: null,
      sideEffectUpperBoundSpec: NO_SIDE_EFFECTS_SPEC,
      stopConditionCodes: ["no_failed_retry_candidate"],
    };
  }

  const selectedCandidate = toSelectedCandidate(selected);

  return {
    status: "ok",
    mode: "read_only_retry_planner",
    willExecute: false,
    executor: "human",
    requiresHumanApproval: true,
    candidateCount,
    selectedCount: 1,
    selected: selectedCandidate,
    nextRedCommand: buildNextRedCommand(selected.notificationKey),
    sideEffectUpperBoundSpec: RED_COMMAND_SIDE_EFFECT_SPEC,
    stopConditionCodes: [],
  };
}

export async function runNotificationRetryPlanCli(): Promise<void> {
  const result = await buildNotificationRetryPlan(db);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runNotificationRetryPlanCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
