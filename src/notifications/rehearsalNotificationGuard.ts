export const SMOKE_OR_REHEARSAL_NOTIFICATION_BLOCK_REASON =
  "smoke_or_rehearsal_notification";

const MARKER_PREFIXES = ["SMOKE_", "SMOKE:", "REHEARSAL_", "REHEARSAL:"] as const;
const MARKER_SEGMENTS = [
  "_SMOKE_",
  ":SMOKE_",
  ":SMOKE:",
  "_REHEARSAL_",
  ":REHEARSAL_",
  ":REHEARSAL:",
] as const;

export function isRehearsalNotificationKey(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    return false;
  }

  return (
    MARKER_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    MARKER_SEGMENTS.some((segment) => normalized.includes(segment))
  );
}

export function isSmokeOrRehearsalNotification(input: {
  notificationKey: string | null | undefined;
  mint: string | null | undefined;
}): boolean {
  return (
    isRehearsalNotificationKey(input.notificationKey) ||
    isRehearsalNotificationKey(input.mint)
  );
}
