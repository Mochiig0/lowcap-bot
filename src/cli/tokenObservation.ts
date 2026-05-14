import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "./db.js";
import { buildSafeMetricSummary, type SafeMetricSummary } from "./metricSafeSummary.js";

type TokenObservationArgs = {
  mint: string;
};

type TokenObservationClient = Pick<PrismaClient, "token" | "notification">;

type ObservationState = "not_observed";

type ObservationReportStatus = "ok" | "not_found";

type JsonObject = Record<string, unknown>;

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type ManualObservationView = {
  schemaVersion: 1;
  source: "manual";
  narrativeCategory: string | ObservationState;
  whyWatch: string | null;
  whySkip: string | null;
  outcomeLabel: string | ObservationState;
  operatorNote: string | null;
  reviewedAt: string;
};

type CommunitySnapshot = {
  hasWebsite: boolean | ObservationState;
  hasX: boolean | ObservationState;
  hasTelegram: boolean | ObservationState;
  linkCount: number | ObservationState;
  metaplexHit: boolean | ObservationState;
  descriptionPresent: boolean | ObservationState;
  source: "reviewFlagsJson" | ObservationState;
};

type HolderDistributionSnapshot = {
  holderSnapshotId: number;
  source: string;
  observedAt: string;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  holderCount: number | null;
  freshWalletCount: number | null;
  bundlerSignal: string;
  sameFundingOriginSignal: string;
  lpWalletExcluded: boolean | null;
  confidence: string;
  rawFree: boolean;
  secretFree: boolean;
} | null;

export type TokenObservationReport = {
  status: ObservationReportStatus;
  mode: "read_only_token_observation_report";
  mint: string;
  tokenIdentity: {
    mint: string;
    name: string | null;
    symbol: string | null;
    source: string | null;
    firstSeenAt: string | null;
    importedAt: string | null;
    createdAt: string | null;
    metadataStatus: string | null;
    scoreRank: string | null;
    scoreTotal: number | null;
    hardRejected: boolean | null;
    hardRejectReason: string | null;
  } | null;
  narrativeSnapshot: {
    narrativeCategory: string | ObservationState;
    attentionSource: string | ObservationState;
    canonicalIdentityConfirmed: ObservationState;
    vampRisk: ObservationState;
    oneLineExplainability: ObservationState;
  };
  manualObservation: ManualObservationView | null;
  communitySnapshot: CommunitySnapshot;
  holderDistributionSnapshot: HolderDistributionSnapshot;
  riskSnapshot: {
    hardRejected: boolean | null;
    hardRejectReason: string | null;
    scoreRank: string | null;
    scoreTotal: number | null;
    topHolderPct: number | ObservationState;
    holderDistribution: "present" | ObservationState;
    liquidityRisk: ObservationState;
    scamSurface: ObservationState;
  };
  metricOutcomeSnapshot: {
    metricCount: number;
    latestMetric: {
      id: number;
      source: string | null;
      observedAt: string;
      launchPrice: number | null;
      peakPrice15m: number | null;
      peakPrice1h: number | null;
      maxMultiple15m: number | null;
      maxMultiple1h: number | null;
      peakFdv24h: number | null;
      volume24h: number | null;
      peakFdv7d: number | null;
      volume7d: number | null;
      timeToPeakMinutes: number | null;
      alertedAt: string | null;
      peakMultipleFromAlert: number | null;
      safeSummary: SafeMetricSummary;
    } | null;
    latestMetricMissing: boolean;
    outcomeLabel: string | ObservationState;
  };
  notificationSnapshot: {
    notificationCount: number;
    sentCount: number;
    failedCount: number;
    latestNotification: {
      notificationKey: string;
      eventType: string;
      trigger: string;
      status: string;
      mode: string;
      sentAt: string | null;
      failedAt: string | null;
      errorCode: string | null;
      reason: string | null;
      retryCount: number;
      nextRetryAt: string | null;
      lastAttemptAt: string | null;
    } | null;
    retryCandidateCount: number;
    sentRowResendEnabled: false;
  };
  observationGaps: string[];
  nextReviewHints: string[];
  safetyBoundary: {
    reviewOnly: true;
    advisoryOutput: false;
    sizingGuidance: false;
    disposalGuidance: false;
    automaticRetry: false;
    queue: false;
    systemd: false;
  };
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm token:observation -- --mint <MINT>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<TokenObservationArgs>,
  key: keyof Pick<TokenObservationArgs, "mint">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): TokenObservationArgs {
  const out: Partial<TokenObservationArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = value;
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return {
    mint: readRequiredArg(out, "mint"),
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function extractReviewFlags(reviewFlagsJson: unknown): ReviewFlagsView | null {
  if (!reviewFlagsJson || typeof reviewFlagsJson !== "object" || Array.isArray(reviewFlagsJson)) {
    return null;
  }

  const hasWebsite = (reviewFlagsJson as JsonObject).hasWebsite;
  const hasX = (reviewFlagsJson as JsonObject).hasX;
  const hasTelegram = (reviewFlagsJson as JsonObject).hasTelegram;
  const metaplexHit = (reviewFlagsJson as JsonObject).metaplexHit;
  const descriptionPresent = (reviewFlagsJson as JsonObject).descriptionPresent;
  const linkCount = (reviewFlagsJson as JsonObject).linkCount;

  if (
    typeof hasWebsite !== "boolean" ||
    typeof hasX !== "boolean" ||
    typeof hasTelegram !== "boolean" ||
    typeof metaplexHit !== "boolean" ||
    typeof descriptionPresent !== "boolean" ||
    typeof linkCount !== "number" ||
    !Number.isInteger(linkCount) ||
    linkCount < 0
  ) {
    return null;
  }

  return {
    hasWebsite,
    hasX,
    hasTelegram,
    metaplexHit,
    descriptionPresent,
    linkCount,
  };
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractManualObservation(entrySnapshot: unknown): ManualObservationView | null {
  if (!entrySnapshot || typeof entrySnapshot !== "object" || Array.isArray(entrySnapshot)) {
    return null;
  }

  const manualObservation = (entrySnapshot as JsonObject).manualObservation;
  if (
    !manualObservation ||
    typeof manualObservation !== "object" ||
    Array.isArray(manualObservation)
  ) {
    return null;
  }

  const schemaVersion = (manualObservation as JsonObject).schemaVersion;
  const source = (manualObservation as JsonObject).source;
  const reviewedAt = readOptionalString((manualObservation as JsonObject).reviewedAt);

  if (schemaVersion !== 1 || source !== "manual" || reviewedAt === null) {
    return null;
  }

  return {
    schemaVersion: 1,
    source: "manual",
    narrativeCategory:
      readOptionalString((manualObservation as JsonObject).narrativeCategory) ??
      "not_observed",
    whyWatch: readOptionalString((manualObservation as JsonObject).whyWatch),
    whySkip: readOptionalString((manualObservation as JsonObject).whySkip),
    outcomeLabel:
      readOptionalString((manualObservation as JsonObject).outcomeLabel) ??
      "not_observed",
    operatorNote: readOptionalString((manualObservation as JsonObject).operatorNote),
    reviewedAt,
  };
}

function buildCommunitySnapshot(reviewFlags: ReviewFlagsView | null): CommunitySnapshot {
  if (reviewFlags === null) {
    return {
      hasWebsite: "not_observed",
      hasX: "not_observed",
      hasTelegram: "not_observed",
      linkCount: "not_observed",
      metaplexHit: "not_observed",
      descriptionPresent: "not_observed",
      source: "not_observed",
    };
  }

  return {
    hasWebsite: reviewFlags.hasWebsite,
    hasX: reviewFlags.hasX,
    hasTelegram: reviewFlags.hasTelegram,
    linkCount: reviewFlags.linkCount,
    metaplexHit: reviewFlags.metaplexHit,
    descriptionPresent: reviewFlags.descriptionPresent,
    source: "reviewFlagsJson",
  };
}

function hasCommunityLinks(reviewFlags: ReviewFlagsView | null): boolean {
  return Boolean(
    reviewFlags &&
      (reviewFlags.hasWebsite ||
        reviewFlags.hasX ||
        reviewFlags.hasTelegram ||
        reviewFlags.linkCount > 0),
  );
}

function hasManualNarrativeCategory(manualObservation: ManualObservationView | null): boolean {
  return Boolean(
    manualObservation &&
      manualObservation.narrativeCategory !== "not_observed",
  );
}

function hasManualThesis(manualObservation: ManualObservationView | null): boolean {
  return Boolean(manualObservation?.whyWatch || manualObservation?.whySkip);
}

function hasManualOutcomeLabel(manualObservation: ManualObservationView | null): boolean {
  return Boolean(
    manualObservation &&
      manualObservation.outcomeLabel !== "not_observed",
  );
}

function buildObservationGaps(input: {
  hasMetrics: boolean;
  hasNotifications: boolean;
  reviewFlags: ReviewFlagsView | null;
  manualObservation: ManualObservationView | null;
  holderDistributionSnapshot: HolderDistributionSnapshot;
}): string[] {
  const holderValuesKnown = Boolean(
    input.holderDistributionSnapshot &&
      (input.holderDistributionSnapshot.topHolderPct !== null ||
        input.holderDistributionSnapshot.top10HolderPct !== null ||
        input.holderDistributionSnapshot.holderCount !== null ||
        input.holderDistributionSnapshot.freshWalletCount !== null ||
        input.holderDistributionSnapshot.bundlerSignal !== "unknown" ||
        input.holderDistributionSnapshot.sameFundingOriginSignal !== "unknown" ||
        input.holderDistributionSnapshot.lpWalletExcluded !== null),
  );

  return [
    ...(hasManualNarrativeCategory(input.manualObservation)
      ? []
      : ["narrativeCategory_not_recorded"]),
    "canonical_identity_not_recorded",
    ...(hasManualThesis(input.manualObservation) ? [] : ["thesis_not_recorded"]),
    ...(hasCommunityLinks(input.reviewFlags) ? [] : ["community_links_not_recorded"]),
    ...(input.reviewFlags?.descriptionPresent === true ? [] : ["description_not_recorded"]),
    ...(input.holderDistributionSnapshot
      ? []
      : ["holder_distribution_not_recorded"]),
    ...(input.holderDistributionSnapshot && !holderValuesKnown
      ? ["holder_distribution_values_unknown"]
      : []),
    ...(input.holderDistributionSnapshot?.source === "manual_holder_review"
      ? ["holder_distribution_manual_review_only"]
      : []),
    "market_condition_not_recorded",
    ...(hasManualOutcomeLabel(input.manualObservation)
      ? []
      : ["outcome_label_not_recorded"]),
    ...(input.hasMetrics ? [] : ["metric_observation_missing"]),
    ...(input.hasNotifications ? [] : ["notification_observation_missing"]),
  ];
}

function buildNextReviewHints(input: {
  hasMetrics: boolean;
  hasNotifications: boolean;
  reviewFlags: ReviewFlagsView | null;
  manualObservation: ManualObservationView | null;
  holderDistributionSnapshot: HolderDistributionSnapshot;
}): string[] {
  return [
    ...(hasManualNarrativeCategory(input.manualObservation)
      ? []
      : ["classify narrative manually"]),
    ...(hasManualThesis(input.manualObservation)
      ? []
      : ["capture watch or skip thesis manually"]),
    ...(hasCommunityLinks(input.reviewFlags) ? [] : ["add community URL if known"]),
    ...(input.holderDistributionSnapshot
      ? ["review persisted holder snapshot context"]
      : ["plan holder distribution snapshot separately"]),
    ...(input.hasMetrics ? ["review latest metric context"] : ["append follow-up metric when approved"]),
    ...(input.hasNotifications ? ["review notification delivery state"] : ["capture notification state if a future event qualifies"]),
    ...(hasManualOutcomeLabel(input.manualObservation)
      ? ["review manual outcome label later if evidence changes"]
      : ["mark skipped/dead/rugged later when outcome evidence exists"]),
  ];
}

function buildNotFoundReport(mint: string): TokenObservationReport {
  return {
    status: "not_found",
    mode: "read_only_token_observation_report",
    mint,
    tokenIdentity: null,
    narrativeSnapshot: {
      narrativeCategory: "not_observed",
      attentionSource: "not_observed",
      canonicalIdentityConfirmed: "not_observed",
      vampRisk: "not_observed",
      oneLineExplainability: "not_observed",
    },
    manualObservation: null,
    communitySnapshot: buildCommunitySnapshot(null),
    holderDistributionSnapshot: null,
    riskSnapshot: {
      hardRejected: null,
      hardRejectReason: null,
      scoreRank: null,
      scoreTotal: null,
      topHolderPct: "not_observed",
      holderDistribution: "not_observed",
      liquidityRisk: "not_observed",
      scamSurface: "not_observed",
    },
    metricOutcomeSnapshot: {
      metricCount: 0,
      latestMetric: null,
      latestMetricMissing: true,
      outcomeLabel: "not_observed",
    },
    notificationSnapshot: {
      notificationCount: 0,
      sentCount: 0,
      failedCount: 0,
      latestNotification: null,
      retryCandidateCount: 0,
      sentRowResendEnabled: false,
    },
    observationGaps: buildObservationGaps({
      hasMetrics: false,
      hasNotifications: false,
      reviewFlags: null,
      manualObservation: null,
      holderDistributionSnapshot: null,
    }),
    nextReviewHints: [
      "confirm mint before creating observation state",
      "classify narrative manually after token intake",
      "append follow-up metric only after token exists",
    ],
    safetyBoundary: {
      reviewOnly: true,
      advisoryOutput: false,
      sizingGuidance: false,
      disposalGuidance: false,
      automaticRetry: false,
      queue: false,
      systemd: false,
    },
  };
}

function retryCandidateWhere(mint: string, now: Date): Prisma.NotificationWhereInput {
  return {
    mint,
    eventType: "metric_appended",
    trigger: "metric_appended",
    status: "failed",
    mode: "live_send",
    rawJsonFree: true,
    secretFree: true,
    notificationKey: {
      not: "",
    },
    metricId: {
      not: null,
    },
    retryCount: {
      lt: 3,
    },
    OR: [
      {
        nextRetryAt: null,
      },
      {
        nextRetryAt: {
          lte: now,
        },
      },
    ],
    AND: [
      {
        OR: [
          {
            leaseUntil: null,
          },
          {
            leaseUntil: {
              lte: now,
            },
          },
        ],
      },
    ],
  };
}

export async function buildTokenObservationReport(
  client: TokenObservationClient,
  mint: string,
  input: { now?: Date } = {},
): Promise<TokenObservationReport> {
  const token = await client.token.findUnique({
    where: {
      mint,
    },
    select: {
      id: true,
      mint: true,
      name: true,
      symbol: true,
      source: true,
      metadataStatus: true,
      hardRejected: true,
      hardRejectReason: true,
      reviewFlagsJson: true,
      entrySnapshot: true,
      scoreTotal: true,
      scoreRank: true,
      importedAt: true,
      createdAt: true,
      metrics: {
        orderBy: [
          {
            observedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 1,
        select: {
          id: true,
          source: true,
          observedAt: true,
          launchPrice: true,
          peakPrice15m: true,
          peakPrice1h: true,
          maxMultiple15m: true,
          maxMultiple1h: true,
          peakFdv24h: true,
          volume24h: true,
          peakFdv7d: true,
          volume7d: true,
          timeToPeakMinutes: true,
          alertedAt: true,
          peakMultipleFromAlert: true,
          rawJson: true,
        },
      },
      holderSnapshots: {
        orderBy: [
          {
            observedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 1,
        select: {
          id: true,
          source: true,
          observedAt: true,
          topHolderPct: true,
          top10HolderPct: true,
          holderCount: true,
          freshWalletCount: true,
          bundlerSignal: true,
          sameFundingOriginSignal: true,
          lpWalletExcluded: true,
          confidence: true,
          rawFree: true,
          secretFree: true,
        },
      },
      _count: {
        select: {
          metrics: true,
          holderSnapshots: true,
        },
      },
    },
  });

  if (!token) {
    return buildNotFoundReport(mint);
  }

  const [
    notificationCount,
    sentCount,
    failedCount,
    latestNotification,
    retryCandidateCount,
  ] = await Promise.all([
    client.notification.count({
      where: {
        mint,
      },
    }),
    client.notification.count({
      where: {
        mint,
        status: "sent",
      },
    }),
    client.notification.count({
      where: {
        mint,
        status: "failed",
      },
    }),
    client.notification.findFirst({
      where: {
        mint,
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      select: {
        notificationKey: true,
        eventType: true,
        trigger: true,
        status: true,
        mode: true,
        sentAt: true,
        failedAt: true,
        errorCode: true,
        reason: true,
        retryCount: true,
        nextRetryAt: true,
        lastAttemptAt: true,
      },
    }),
    client.notification.count({
      where: retryCandidateWhere(mint, input.now ?? new Date()),
    }),
  ]);

  const latestMetric = token.metrics[0] ?? null;
  const hasMetrics = token._count.metrics > 0;
  const hasNotifications = notificationCount > 0;
  const reviewFlags = extractReviewFlags(token.reviewFlagsJson);
  const manualObservation = extractManualObservation(token.entrySnapshot);
  const latestHolderSnapshot = token.holderSnapshots[0] ?? null;
  const holderDistributionSnapshot: HolderDistributionSnapshot = latestHolderSnapshot
    ? {
      holderSnapshotId: latestHolderSnapshot.id,
      source: latestHolderSnapshot.source,
      observedAt: latestHolderSnapshot.observedAt.toISOString(),
      topHolderPct: latestHolderSnapshot.topHolderPct,
      top10HolderPct: latestHolderSnapshot.top10HolderPct,
      holderCount: latestHolderSnapshot.holderCount,
      freshWalletCount: latestHolderSnapshot.freshWalletCount,
      bundlerSignal: latestHolderSnapshot.bundlerSignal,
      sameFundingOriginSignal: latestHolderSnapshot.sameFundingOriginSignal,
      lpWalletExcluded: latestHolderSnapshot.lpWalletExcluded,
      confidence: latestHolderSnapshot.confidence,
      rawFree: latestHolderSnapshot.rawFree,
      secretFree: latestHolderSnapshot.secretFree,
    }
    : null;

  return {
    status: "ok",
    mode: "read_only_token_observation_report",
    mint,
    tokenIdentity: {
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      source: token.source,
      firstSeenAt: iso(token.importedAt ?? token.createdAt),
      importedAt: iso(token.importedAt),
      createdAt: iso(token.createdAt),
      metadataStatus: token.metadataStatus,
      scoreRank: token.scoreRank,
      scoreTotal: token.scoreTotal,
      hardRejected: token.hardRejected,
      hardRejectReason: token.hardRejectReason,
    },
    narrativeSnapshot: {
      narrativeCategory: manualObservation?.narrativeCategory ?? "not_observed",
      attentionSource: token.source ?? "not_observed",
      canonicalIdentityConfirmed: "not_observed",
      vampRisk: "not_observed",
      oneLineExplainability: "not_observed",
    },
    manualObservation,
    communitySnapshot: buildCommunitySnapshot(reviewFlags),
    holderDistributionSnapshot,
    riskSnapshot: {
      hardRejected: token.hardRejected,
      hardRejectReason: token.hardRejectReason,
      scoreRank: token.scoreRank,
      scoreTotal: token.scoreTotal,
      topHolderPct: holderDistributionSnapshot?.topHolderPct ?? "not_observed",
      holderDistribution: holderDistributionSnapshot ? "present" : "not_observed",
      liquidityRisk: "not_observed",
      scamSurface: "not_observed",
    },
    metricOutcomeSnapshot: {
      metricCount: token._count.metrics,
      latestMetric: latestMetric
        ? {
            id: latestMetric.id,
            source: latestMetric.source,
            observedAt: latestMetric.observedAt.toISOString(),
            launchPrice: latestMetric.launchPrice,
            peakPrice15m: latestMetric.peakPrice15m,
            peakPrice1h: latestMetric.peakPrice1h,
            maxMultiple15m: latestMetric.maxMultiple15m,
            maxMultiple1h: latestMetric.maxMultiple1h,
            peakFdv24h: latestMetric.peakFdv24h,
            volume24h: latestMetric.volume24h,
            peakFdv7d: latestMetric.peakFdv7d,
            volume7d: latestMetric.volume7d,
            timeToPeakMinutes: latestMetric.timeToPeakMinutes,
            alertedAt: iso(latestMetric.alertedAt),
            peakMultipleFromAlert: latestMetric.peakMultipleFromAlert,
            safeSummary: buildSafeMetricSummary(latestMetric.rawJson),
          }
        : null,
      latestMetricMissing: !hasMetrics,
      outcomeLabel: manualObservation?.outcomeLabel ?? "not_observed",
    },
    notificationSnapshot: {
      notificationCount,
      sentCount,
      failedCount,
      latestNotification: latestNotification
        ? {
            notificationKey: latestNotification.notificationKey,
            eventType: latestNotification.eventType,
            trigger: latestNotification.trigger,
            status: latestNotification.status,
            mode: latestNotification.mode,
            sentAt: iso(latestNotification.sentAt),
            failedAt: iso(latestNotification.failedAt),
            errorCode: latestNotification.errorCode,
            reason: latestNotification.reason,
            retryCount: latestNotification.retryCount,
            nextRetryAt: iso(latestNotification.nextRetryAt),
            lastAttemptAt: iso(latestNotification.lastAttemptAt),
          }
        : null,
      retryCandidateCount,
      sentRowResendEnabled: false,
    },
    observationGaps: buildObservationGaps({
      hasMetrics,
      hasNotifications,
      reviewFlags,
      manualObservation,
      holderDistributionSnapshot,
    }),
    nextReviewHints: buildNextReviewHints({
      hasMetrics,
      hasNotifications,
      reviewFlags,
      manualObservation,
      holderDistributionSnapshot,
    }),
    safetyBoundary: {
      reviewOnly: true,
      advisoryOutput: false,
      sizingGuidance: false,
      disposalGuidance: false,
      automaticRetry: false,
      queue: false,
      systemd: false,
    },
  };
}

export async function runTokenObservationCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const result = await buildTokenObservationReport(db, args.mint);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runTokenObservationCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
