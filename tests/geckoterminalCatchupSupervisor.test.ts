import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  buildGeckoTokenWriteRunnerInput,
  parseGeckoTokenWriteCommandResult,
  runGeckoTokenWriteCommandWithRunner,
  toGeckoCatchupTokenWriteExecutionResult,
  type GeckoTokenWriteCommandRunner,
} from "../src/cli/geckoterminalCatchupTokenWriteRunner.ts";

const execFileAsync = promisify(execFile);

const GECKO_SOURCE = "geckoterminal.new_pools";

type CatchupSupervisorModule = typeof import("../src/cli/geckoterminalCatchupSupervisor.ts");

let catchupSupervisorModule: CatchupSupervisorModule | null = null;
let previousDatabaseUrlForLoadedSupervisor: string | undefined;

type SyntheticWriteCommandPlan = {
  executionSupported: boolean;
  executionEligible: boolean;
  blockedBy: string[];
  notify: boolean;
  metricAppend: boolean;
  postCheck: boolean;
};

type CommandSuccess = {
  ok: true;
  stdout: string;
  stderr: string;
};

type CommandFailure = {
  ok: false;
  stdout: string;
  stderr: string;
  code: number | null;
};

type CommandResult = CommandSuccess | CommandFailure;

type SafetyCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

type TokenWriteExecutionResult = {
  mint: string;
  cycle: number;
  orderInCycle: number;
  status: "ok" | "cli_error" | "parse_error";
  exitCode: number | null;
  rateLimited: boolean;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  writeSummary: {
    enrichUpdated: boolean;
    rescoreUpdated: boolean;
    contextUpdated: boolean;
    metaplexContextUpdated: boolean;
  } | null;
  notifySent: boolean;
  itemError: string | null;
  metaplexErrorKind: string | null;
  parseError: string | null;
};

type TokenWritePostCheckResult = {
  checked: boolean;
  mint: string;
  runnerStatus: "ok" | "cli_error" | "parse_error";
  tokenFound: boolean;
  metadataStatus: string | null;
  hasName: boolean;
  hasSymbol: boolean;
  isStillPending: boolean;
  metricsCount: number;
  hasLatestMetric: boolean;
  warnings: string[];
};

type CatchupSupervisorOutput = {
  readOnly: boolean;
  dryRun: boolean;
  writeEnabled: boolean;
  selection: {
    pumpOnly: boolean;
    limit: number;
    maxCycles: number;
    sinceMinutes: number;
  };
  summary: {
    status: "no_pending" | "ready" | "warning" | "blocked";
    safeToWrite: boolean;
    plannedTokenWrites: number;
    plannedMetricAppends: number;
    blockingSafetyChecks: string[];
    warningSafetyChecks: string[];
    nextRecommendedAction:
      | "no_action"
      | "run_planned_cycles"
      | "inspect_warning_safety_checks"
      | "inspect_blocking_safety_checks";
  };
  writePlan: {
    enabled: boolean;
    writeModeSupported: boolean;
    writeRequested: boolean;
    recommendedInitialWriteArgs: {
      limit: 1;
      maxCycles: 1;
      postCheck: true;
      requireMetricAppend: false;
    };
    recommendedInitialTokenWriteArgs: {
      limit: 1;
      maxCycles: 1;
      postCheck: true;
      notify: false;
      metricAppend: false;
    };
    wouldWriteTokens: Array<{
      cycle: number;
      orderInCycle: number;
      mint: string;
    }>;
    wouldAppendMetrics: Array<{
      cycle: number;
      mint: string;
    }>;
    writeCommandPlan: Array<{
      enabled: boolean;
      executionSupported: boolean;
      executionEligible: boolean;
      command: "pnpm";
      script: "token:enrich-rescore:geckoterminal";
      mint: string;
      cycle: number;
      orderInCycle: number;
      notify: false;
      metricAppend: false;
      postCheck: true;
      reason: "selected_incomplete_token_write";
      blockedBy: string[];
    }>;
    tokenWriteExecutionResults: TokenWriteExecutionResult[];
    requiresCaptureOnly: true;
    postCheckPlan: {
      enabled: true;
      requireMetricPendingMatchesIncomplete: true;
      requireSelectedLatestMetricPresent: true;
    };
    postCheckResult: TokenWritePostCheckResult | null;
    recoveryHints: {
      metricOnlyAppendCandidates: string[];
      tokenWriteRetryCandidates: string[];
      inspectTokenCandidates: string[];
      runnerDbMismatchCandidates: string[];
      cooldownRecommended: true;
      resumeWithLimit: 1;
      resumeWithMaxCycles: 1;
    };
  };
  writeModeReadiness: {
    readyForImplementation: true;
    supportedWriteMode: "limited_token_only_initial_check";
    blockingReasons: [];
    remainingUnsupportedWriteBehaviors: [
      "metric_append",
      "telegram_notify",
      "multi_token_write",
      "multi_cycle_write",
      "capture_file",
      "cooldown",
    ];
    nextImplementationStep: "run_first_token_only_operational_check";
  };
  currentCounts: {
    pumpTotal: number;
    pumpComplete: number;
    pumpIncomplete: number;
    metricTokenCount: number;
    metricCount: number;
    latestMetricPresentCount: number;
    latestMetricMissingCount: number;
    metricPendingCount: number;
    notifyCandidateCount: number;
    skippedNonPumpCount: number;
  };
  pendingCount: number;
  wouldRunCycles: number;
  selectedCandidates: Array<{
    cycle: number;
    orderInCycle: number;
    id: number;
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    metadataStatus: string;
    name: string | null;
    symbol: string | null;
    scoreRank: string;
    scoreTotal: number;
    hardRejected: boolean;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    metricsCount: number;
    latestMetric: {
      id: number;
      source: string | null;
      observedAt: string;
      volume24h: number | null;
    } | null;
    wouldWriteToken: boolean;
  }>;
  metricAppendPlan: Array<{
    cycle: number;
    mint: string;
    wouldAppendMetric: boolean;
    reason: string;
    metricsCount: number;
    latestMetric: {
      id: number;
      source: string | null;
      observedAt: string;
      volume24h: number | null;
    } | null;
  }>;
  cycles: Array<{
    cycle: number;
    selectedCount: number;
    selectedCandidates: CatchupSupervisorOutput["selectedCandidates"];
    metricAppendPlan: CatchupSupervisorOutput["metricAppendPlan"];
  }>;
  stopReason: string;
  safetyChecks: SafetyCheck[];
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-catchup-supervisor-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
  await execFileAsync("bash", ["-lc", "pnpm exec prisma db push --skip-generate"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}

async function loadCatchupSupervisorModule(databaseUrl: string): Promise<CatchupSupervisorModule> {
  if (!catchupSupervisorModule) {
    previousDatabaseUrlForLoadedSupervisor = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    catchupSupervisorModule = await import("../src/cli/geckoterminalCatchupSupervisor.ts");
  }

  return catchupSupervisorModule;
}

async function disconnectLoadedCatchupSupervisorDb(): Promise<void> {
  if (!catchupSupervisorModule) {
    return;
  }

  const { db } = await import("../src/cli/db.ts");
  await db.$disconnect();
  if (previousDatabaseUrlForLoadedSupervisor === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrlForLoadedSupervisor;
  }
}

function getLoadedCatchupSupervisorModule(): CatchupSupervisorModule {
  assert.ok(catchupSupervisorModule, "catchup supervisor module must be loaded by an earlier fixture");
  return catchupSupervisorModule;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function expectedTokenWriteArgs(mint: string): string[] {
  return [
    "token:enrich-rescore:geckoterminal",
    "--",
    "--mint",
    mint,
    "--write",
  ];
}

async function runCatchupSupervisor(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-catchup-supervisor-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-catchup-supervisor-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalCatchupSupervisor.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
        },
      },
    );

    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8"),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const output = error as {
      code?: number | null;
    };
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8").catch(() => ""),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    return {
      ok: false,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      code: output.code ?? null,
    };
  } finally {
    await rm(stdoutPath, { force: true });
    await rm(stderrPath, { force: true });
  }
}

function safetyStatus(output: CatchupSupervisorOutput, name: string): SafetyCheck["status"] {
  const check = output.safetyChecks.find((item) => item.name === name);
  assert.ok(check, `missing safety check: ${name}`);
  return check.status;
}

function assertReadOnlyWritePlan(
  output: CatchupSupervisorOutput,
  options: { writeRequested?: boolean } = {},
): void {
  assert.equal(output.readOnly, true);
  assert.equal(output.dryRun, true);
  assert.equal(output.writeEnabled, false);
  assert.equal(output.writePlan.enabled, false);
  assert.equal(output.writePlan.writeModeSupported, true);
  assert.equal(output.writePlan.writeRequested, options.writeRequested ?? false);
  assert.deepEqual(output.writePlan.recommendedInitialWriteArgs, {
    limit: 1,
    maxCycles: 1,
    postCheck: true,
    requireMetricAppend: false,
  });
  assert.deepEqual(output.writePlan.recommendedInitialTokenWriteArgs, {
    limit: 1,
    maxCycles: 1,
    postCheck: true,
    notify: false,
    metricAppend: false,
  });
  assert.deepEqual(output.writePlan.tokenWriteExecutionResults, []);
  assert.equal(output.writePlan.requiresCaptureOnly, true);
  assert.deepEqual(output.writePlan.postCheckPlan, {
    enabled: true,
    requireMetricPendingMatchesIncomplete: true,
    requireSelectedLatestMetricPresent: true,
  });
  assert.equal(output.writePlan.postCheckResult, null);
  assert.deepEqual(output.writePlan.recoveryHints, {
    metricOnlyAppendCandidates: [],
    tokenWriteRetryCandidates: [],
    inspectTokenCandidates: [],
    runnerDbMismatchCandidates: [],
    cooldownRecommended: true,
    resumeWithLimit: 1,
    resumeWithMaxCycles: 1,
  });
}

async function seedCompletedBacklog(databaseUrl: string): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = new Date();
    const completeToken = await db.token.create({
      data: {
        mint: "GeckoCatchupComplete111111111111111111111111111pump",
        source: GECKO_SOURCE,
        name: "Complete Token",
        symbol: "COMP",
        metadataStatus: "partial",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: now,
        importedAt: now,
        enrichedAt: now,
        rescoredAt: now,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: now.toISOString(),
          },
        },
      },
      select: {
        id: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: completeToken.id,
        source: "geckoterminal.token_snapshot",
        observedAt: now,
        volume24h: 0,
      },
    });

    await db.token.create({
      data: {
        mint: "GeckoCatchupNonPump111111111111111111111111111",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        createdAt: now,
        importedAt: now,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: now.toISOString(),
          },
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function seedSafetyStopFixture(databaseUrl: string): Promise<{
  metricPendingMint: string;
  smokeMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const detectedAt = new Date();
    const notifyToken = await db.token.create({
      data: {
        mint: "GeckoCatchupNotify111111111111111111111111111pump",
        source: GECKO_SOURCE,
        name: "Notify Token",
        symbol: "NOTIFY",
        metadataStatus: "partial",
        scoreRank: "S",
        scoreTotal: 100,
        hardRejected: false,
        createdAt: detectedAt,
        importedAt: detectedAt,
        enrichedAt: detectedAt,
        rescoredAt: detectedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: detectedAt.toISOString(),
          },
        },
      },
      select: {
        id: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: notifyToken.id,
        source: "geckoterminal.token_snapshot",
        observedAt: detectedAt,
      },
    });

    await db.token.create({
      data: {
        mint: "GeckoCatchupValid11111111111111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: detectedAt,
        importedAt: detectedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: detectedAt.toISOString(),
          },
        },
      },
    });

    const metricPendingToken = await db.token.create({
      data: {
        mint: "GeckoCatchupMetricPending1111111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: detectedAt,
        importedAt: detectedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: detectedAt.toISOString(),
          },
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: metricPendingToken.id,
        source: "geckoterminal.token_snapshot",
        observedAt: detectedAt,
      },
    });

    const smokeToken = await db.token.create({
      data: {
        mint: "SMOKE_GeckoCatchupSafety111111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: detectedAt,
        importedAt: detectedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: detectedAt.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    return {
      metricPendingMint: metricPendingToken.mint,
      smokeMint: smokeToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

async function seedPendingSelectionFixture(databaseUrl: string): Promise<{
  expectedSelectedMints: string[];
  unselectedMint: string;
  sameAnchorHigherIdMint: string;
  sameAnchorLowerIdMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = new Date();
    const newestAnchor = new Date(now.getTime() - 5 * 60_000);
    const sameAnchor = new Date(now.getTime() - 10 * 60_000);
    const olderAnchor = new Date(now.getTime() - 20 * 60_000);
    const oldestAnchor = new Date(now.getTime() - 30 * 60_000);

    async function createPendingToken(mint: string, detectedAt: Date): Promise<{
      id: number;
      mint: string;
    }> {
      return db.token.create({
        data: {
          mint,
          source: GECKO_SOURCE,
          metadataStatus: "mint_only",
          scoreRank: "C",
          scoreTotal: 0,
          hardRejected: false,
          createdAt: detectedAt,
          importedAt: detectedAt,
          entrySnapshot: {
            firstSeenSourceSnapshot: {
              source: GECKO_SOURCE,
              detectedAt: detectedAt.toISOString(),
            },
          },
        },
        select: {
          id: true,
          mint: true,
        },
      });
    }

    const unselected = await createPendingToken(
      "GeckoCatchupPendingOldest11111111111111111111pump",
      oldestAnchor,
    );
    const older = await createPendingToken(
      "GeckoCatchupPendingOlder111111111111111111111pump",
      olderAnchor,
    );
    const sameAnchorLowerId = await createPendingToken(
      "GeckoCatchupPendingSameLow111111111111111111pump",
      sameAnchor,
    );
    const sameAnchorHigherId = await createPendingToken(
      "GeckoCatchupPendingSameHigh11111111111111111pump",
      sameAnchor,
    );
    const newest = await createPendingToken(
      "GeckoCatchupPendingNewest11111111111111111111pump",
      newestAnchor,
    );

    assert.ok(
      sameAnchorHigherId.id > sameAnchorLowerId.id,
      "fixture must create the higher id row after the lower id row",
    );

    return {
      expectedSelectedMints: [
        newest.mint,
        sameAnchorHigherId.mint,
        sameAnchorLowerId.mint,
        older.mint,
      ],
      unselectedMint: unselected.mint,
      sameAnchorHigherIdMint: sameAnchorHigherId.mint,
      sameAnchorLowerIdMint: sameAnchorLowerId.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

async function markTokenWritePostCheckComplete(
  databaseUrl: string,
  mint: string,
  options: { includeMetric?: boolean } = {},
): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = new Date();
    const token = await db.token.update({
      where: {
        mint,
      },
      data: {
        name: "Post Check Token",
        symbol: "POST",
        metadataStatus: "partial",
        enrichedAt: now,
        rescoredAt: now,
      },
      select: {
        id: true,
      },
    });

    if (options.includeMetric) {
      await db.metric.create({
        data: {
          tokenId: token.id,
          source: "geckoterminal.token_snapshot",
          observedAt: now,
          volume24h: 0,
        },
      });
    }
  } finally {
    await db.$disconnect();
  }
}

async function seedUnsafeCandidateFixture(databaseUrl: string): Promise<{
  smokeMint: string;
  metricPresentMint: string;
  hardRejectedMint: string;
  completeMint: string;
  nonGeckoMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = new Date();
    const smokeAnchor = new Date(now.getTime() - 5 * 60_000);
    const metricAnchor = new Date(now.getTime() - 10 * 60_000);
    const hardRejectedAnchor = new Date(now.getTime() - 15 * 60_000);
    const completeAnchor = new Date(now.getTime() - 20 * 60_000);
    const nonGeckoAnchor = new Date(now.getTime() - 25 * 60_000);

    const smokeToken = await db.token.create({
      data: {
        mint: "SMOKE_GeckoCatchupUnsafe11111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: smokeAnchor,
        importedAt: smokeAnchor,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: smokeAnchor.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    const metricPresentToken = await db.token.create({
      data: {
        mint: "GeckoCatchupUnsafeMetric111111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: metricAnchor,
        importedAt: metricAnchor,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: metricAnchor.toISOString(),
          },
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: metricPresentToken.id,
        source: "geckoterminal.token_snapshot",
        observedAt: metricAnchor,
        volume24h: 0,
      },
    });

    const hardRejectedToken = await db.token.create({
      data: {
        mint: "GeckoCatchupUnsafeRejected1111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: true,
        createdAt: hardRejectedAnchor,
        importedAt: hardRejectedAnchor,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: hardRejectedAnchor.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    const completeToken = await db.token.create({
      data: {
        mint: "GeckoCatchupUnsafeComplete111111111111111111pump",
        source: GECKO_SOURCE,
        name: "Already Complete",
        symbol: "DONE",
        metadataStatus: "partial",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: completeAnchor,
        importedAt: completeAnchor,
        enrichedAt: completeAnchor,
        rescoredAt: completeAnchor,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: completeAnchor.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    const nonGeckoToken = await db.token.create({
      data: {
        mint: "GeckoCatchupUnsafeNonGecko111111111111111111pump",
        source: "dexscreener.token_profiles",
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: nonGeckoAnchor,
        importedAt: nonGeckoAnchor,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: "dexscreener.token_profiles",
            detectedAt: nonGeckoAnchor.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    return {
      smokeMint: smokeToken.mint,
      metricPresentMint: metricPresentToken.mint,
      hardRejectedMint: hardRejectedToken.mint,
      completeMint: completeToken.mint,
      nonGeckoMint: nonGeckoToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

async function seedHardRejectedOnlyFixture(databaseUrl: string): Promise<{
  hardRejectedMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const detectedAt = new Date();
    const hardRejectedToken = await db.token.create({
      data: {
        mint: "GeckoCatchupRejectedOnly11111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: true,
        createdAt: detectedAt,
        importedAt: detectedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: detectedAt.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    return {
      hardRejectedMint: hardRejectedToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("geckoterminal catch-up supervisor dry-run", async (t) => {
  await t.test("handles gated write requests through injected runner boundary", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "mock-runner-boundary.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedPendingSelectionFixture(databaseUrl);
      const supervisor = await loadCatchupSupervisorModule(databaseUrl);
      const buildGatedWriteArgs = () =>
        supervisor.parseGeckoCatchupSupervisorArgs([
          "--write",
          "--pumpOnly",
          "--limit",
          "1",
          "--maxCycles",
          "1",
          "--sinceMinutes",
          "10080",
          "--dry-run",
        ]);

      try {
        const args = buildGatedWriteArgs();
        const output = await supervisor.runGeckoCatchupSupervisor(args);

        assert.equal(args.writeRequested, true);
        assertReadOnlyWritePlan(output, { writeRequested: true });
        assert.equal(output.selectedCandidates.length, 1);
        assert.equal(output.selectedCandidates[0]?.mint, seeded.expectedSelectedMints[0]);

        const [plan] = output.writePlan.writeCommandPlan;
        assert.ok(plan);
        assert.equal(plan.executionSupported, true);
        assert.equal(plan.executionEligible, true);
        assert.deepEqual(plan.blockedBy, []);
        assert.equal("args" in plan, false);
        assert.equal(plan.notify, false);
        assert.equal(plan.metricAppend, false);
        assert.equal(plan.postCheck, true);
        assert.equal(output.writePlan.enabled, false);
        assert.equal(output.writePlan.writeModeSupported, true);
        assert.equal(output.writePlan.writeRequested, true);
        assert.equal(output.readOnly, true);
        assert.equal(output.dryRun, true);
        assert.equal(output.writeEnabled, false);
        assert.deepEqual(output.writePlan.tokenWriteExecutionResults, []);
        assert.equal(supervisor.shouldRunGeckoTokenWriteRunner(output.writePlan.writeCommandPlan), false);
        const mockResult = parseGeckoTokenWriteCommandResult({
          exitCode: 0,
          stdout: JSON.stringify({
            items: [
              {
                mint: seeded.expectedSelectedMints[0],
                notifySent: false,
                writeSummary: {
                  enrichUpdated: true,
                  rescoreUpdated: true,
                  contextUpdated: true,
                  metaplexContextUpdated: true,
                },
              },
            ],
            summary: {
              notifySentCount: 0,
              rateLimited: false,
              abortedDueToRateLimit: false,
              skippedAfterRateLimit: 0,
            },
          }),
          stderr: "[token:enrich-rescore:geckoterminal] raw runner diagnostic",
        });
        const runnerCalls: Parameters<GeckoTokenWriteCommandRunner>[0][] = [];
        const tokenWriteRunner: GeckoTokenWriteCommandRunner = async (input) => {
          runnerCalls.push(input);
          return mockResult;
        };
        const runnerOutput = await supervisor.runGeckoCatchupSupervisor(buildGatedWriteArgs(), {
          tokenWriteRunner,
        });

        assert.equal(runnerCalls.length, 1);
        assert.equal(runnerOutput.writePlan.enabled, true);
        assert.equal(runnerOutput.writePlan.writeModeSupported, true);
        assert.equal(runnerOutput.writePlan.writeRequested, true);
        assert.equal(runnerOutput.readOnly, false);
        assert.equal(runnerOutput.dryRun, false);
        assert.equal(runnerOutput.writeEnabled, true);
        assert.equal(runnerOutput.selectedCandidates.length, 1);
        assert.equal(runnerOutput.selectedCandidates[0]?.mint, seeded.expectedSelectedMints[0]);

        const [runnerPlan] = runnerOutput.writePlan.writeCommandPlan;
        assert.ok(runnerPlan);
        assert.equal(runnerPlan.enabled, true);
        assert.equal(runnerPlan.executionSupported, true);
        assert.equal(runnerPlan.executionEligible, true);
        assert.deepEqual(runnerPlan.blockedBy, []);
        assert.equal(runnerPlan.notify, false);
        assert.equal(runnerPlan.metricAppend, false);
        assert.equal(runnerPlan.postCheck, true);
        assert.equal(runnerCalls[0]?.command, runnerPlan.command);
        assert.deepEqual(runnerCalls[0]?.args, expectedTokenWriteArgs(runnerPlan.mint));
        assert.equal("args" in runnerPlan, false);
        assert.equal(runnerCalls[0]?.mint, runnerPlan.mint);
        assert.equal(runnerCalls[0]?.cycle, runnerPlan.cycle);
        assert.equal(runnerCalls[0]?.orderInCycle, runnerPlan.orderInCycle);
        assert.equal(runnerCalls[0]?.notify, false);
        assert.equal(runnerCalls[0]?.metricAppend, false);
        assert.equal(runnerCalls[0]?.postCheck, true);

        assert.equal(runnerOutput.writePlan.tokenWriteExecutionResults.length, 1);
        assert.deepEqual(runnerOutput.writePlan.tokenWriteExecutionResults[0], {
          mint: seeded.expectedSelectedMints[0],
          cycle: runnerPlan.cycle,
          orderInCycle: runnerPlan.orderInCycle,
          status: "ok",
          exitCode: 0,
          rateLimited: false,
          abortedDueToRateLimit: false,
          skippedAfterRateLimit: 0,
          writeSummary: {
            enrichUpdated: true,
            rescoreUpdated: true,
            contextUpdated: true,
            metaplexContextUpdated: true,
          },
          notifySent: false,
          itemError: null,
          metaplexErrorKind: null,
          parseError: null,
        });
        assert.equal("stdout" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("stderr" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("parsedOutput" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("env" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("cwd" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("args" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("command" in runnerOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.deepEqual(runnerOutput.writePlan.postCheckPlan, {
          enabled: true,
          requireMetricPendingMatchesIncomplete: true,
          requireSelectedLatestMetricPresent: true,
        });
        assert.deepEqual(runnerOutput.writePlan.postCheckResult, {
          checked: true,
          mint: seeded.expectedSelectedMints[0],
          runnerStatus: "ok",
          tokenFound: true,
          metadataStatus: "mint_only",
          hasName: false,
          hasSymbol: false,
          isStillPending: true,
          metricsCount: 0,
          hasLatestMetric: false,
          warnings: [
            "metadata_status_still_mint_only",
            "token_still_pending_after_runner",
            "name_missing_after_runner",
            "symbol_missing_after_runner",
            "metric_missing_after_token_only_write",
            "runner_ok_but_db_token_not_complete",
          ],
        });
        assert.deepEqual(runnerOutput.writePlan.recoveryHints, {
          metricOnlyAppendCandidates: [],
          tokenWriteRetryCandidates: [seeded.expectedSelectedMints[0]],
          inspectTokenCandidates: [seeded.expectedSelectedMints[0]],
          runnerDbMismatchCandidates: [seeded.expectedSelectedMints[0]],
          cooldownRecommended: true,
          resumeWithLimit: 1,
          resumeWithMaxCycles: 1,
        });
        assert.equal(
          supervisor.shouldRunGeckoTokenWriteRunner(
            runnerOutput.writePlan.writeCommandPlan,
            {
              tokenWriteRunner,
            },
          ),
          true,
        );

        const cliRunnerCalls: Parameters<GeckoTokenWriteCommandRunner>[0][] = [];
        const cliTokenWriteRunner: GeckoTokenWriteCommandRunner = async (input) => {
          cliRunnerCalls.push(input);
          return mockResult;
        };
        const cliOutputLines: string[] = [];
        const originalConsoleLog = console.log;
        console.log = (...values: unknown[]) => {
          cliOutputLines.push(values.map(String).join(" "));
        };
        try {
          await supervisor.runGeckoCatchupSupervisorCli(
            [
              "--write",
              "--pumpOnly",
              "--limit",
              "1",
              "--maxCycles",
              "1",
              "--sinceMinutes",
              "10080",
              "--dry-run",
            ],
            {
              tokenWriteRunner: cliTokenWriteRunner,
            },
          );
        } finally {
          console.log = originalConsoleLog;
        }

        assert.equal(cliRunnerCalls.length, 1);
        assert.equal(cliOutputLines.length, 1);
        const cliOutput = JSON.parse(cliOutputLines[0] ?? "") as CatchupSupervisorOutput;
        assert.equal(cliOutput.writePlan.enabled, true);
        assert.equal(cliOutput.writePlan.writeModeSupported, true);
        assert.equal(cliOutput.writePlan.writeCommandPlan[0]?.executionSupported, true);
        assert.equal(cliOutput.writePlan.writeCommandPlan[0]?.executionEligible, true);
        assert.deepEqual(cliOutput.writePlan.writeCommandPlan[0]?.blockedBy, []);
        assert.equal("args" in (cliOutput.writePlan.writeCommandPlan[0] ?? {}), false);
        assert.equal(cliOutput.writePlan.tokenWriteExecutionResults.length, 1);
        assert.equal(cliOutput.writePlan.tokenWriteExecutionResults[0]?.status, "ok");
        assert.equal(cliOutput.writePlan.postCheckResult?.runnerStatus, "ok");
        assert.equal(cliOutput.writePlan.postCheckResult?.isStillPending, true);
        assert.equal("stdout" in cliOutput.writePlan.tokenWriteExecutionResults[0], false);
        assert.equal("stderr" in cliOutput.writePlan.tokenWriteExecutionResults[0], false);

        const rateLimitRunner: GeckoTokenWriteCommandRunner = async () =>
          parseGeckoTokenWriteCommandResult({
            exitCode: 0,
            stdout: JSON.stringify({
              items: [],
              summary: {
                notifySentCount: 0,
                rateLimited: true,
                abortedDueToRateLimit: true,
                skippedAfterRateLimit: 2,
              },
            }),
            stderr: "raw rate limit diagnostic",
          });
        const rateLimitOutput = await supervisor.runGeckoCatchupSupervisor(buildGatedWriteArgs(), {
          tokenWriteRunner: rateLimitRunner,
        });

        const [rateLimitResult] = rateLimitOutput.writePlan.tokenWriteExecutionResults;
        assert.ok(rateLimitResult);
        assert.equal(rateLimitResult.rateLimited, true);
        assert.equal(rateLimitResult.abortedDueToRateLimit, true);
        assert.equal(rateLimitResult.skippedAfterRateLimit, 2);
        assert.deepEqual(rateLimitOutput.writePlan.recoveryHints, {
          metricOnlyAppendCandidates: [],
          tokenWriteRetryCandidates: [seeded.expectedSelectedMints[0]],
          inspectTokenCandidates: [seeded.expectedSelectedMints[0]],
          runnerDbMismatchCandidates: [seeded.expectedSelectedMints[0]],
          cooldownRecommended: true,
          resumeWithLimit: 1,
          resumeWithMaxCycles: 1,
        });

        const parseErrorRunner: GeckoTokenWriteCommandRunner = async () => {
          await markTokenWritePostCheckComplete(databaseUrl, seeded.expectedSelectedMints[0]);
          return parseGeckoTokenWriteCommandResult({
            exitCode: 0,
            stdout: "{not-json",
            stderr: "raw parse diagnostic",
          });
        };
        const parseErrorOutput = await supervisor.runGeckoCatchupSupervisor(buildGatedWriteArgs(), {
          tokenWriteRunner: parseErrorRunner,
        });

        const [parseErrorResult] = parseErrorOutput.writePlan.tokenWriteExecutionResults;
        assert.ok(parseErrorResult);
        assert.equal(parseErrorResult.mint, seeded.expectedSelectedMints[0]);
        assert.equal(parseErrorResult.status, "parse_error");
        assert.equal(parseErrorResult.exitCode, 0);
        assert.match(parseErrorResult.parseError ?? "", /Expected property name|Unexpected token|JSON/);
        assert.equal(parseErrorResult.writeSummary, null);
        assert.equal(parseErrorResult.notifySent, false);
        assert.equal("stdout" in parseErrorResult, false);
        assert.equal("stderr" in parseErrorResult, false);
        assert.equal("parsedOutput" in parseErrorResult, false);
        assert.deepEqual(parseErrorOutput.writePlan.postCheckResult, {
          checked: true,
          mint: seeded.expectedSelectedMints[0],
          runnerStatus: "parse_error",
          tokenFound: true,
          metadataStatus: "partial",
          hasName: true,
          hasSymbol: true,
          isStillPending: false,
          metricsCount: 0,
          hasLatestMetric: false,
          warnings: [
            "metric_missing_after_token_only_write",
            "runner_result_not_ok_but_db_token_updated",
          ],
        });
        assert.deepEqual(parseErrorOutput.writePlan.recoveryHints, {
          metricOnlyAppendCandidates: [seeded.expectedSelectedMints[0]],
          tokenWriteRetryCandidates: [],
          inspectTokenCandidates: [seeded.expectedSelectedMints[0]],
          runnerDbMismatchCandidates: [seeded.expectedSelectedMints[0]],
          cooldownRecommended: true,
          resumeWithLimit: 1,
          resumeWithMaxCycles: 1,
        });

        await seedUnsafeCandidateFixture(databaseUrl);
        const guardFalseRunnerCalls: unknown[] = [];
        const guardFalseRunner: GeckoTokenWriteCommandRunner = async (input) => {
          guardFalseRunnerCalls.push(input);
          throw new Error("tokenWriteRunner should not be called for invalid write requests");
        };
        const guardFalseOutput = await supervisor.runGeckoCatchupSupervisor(buildGatedWriteArgs(), {
          tokenWriteRunner: guardFalseRunner,
        });

        assert.equal(guardFalseRunnerCalls.length, 0);
        assert.equal(guardFalseOutput.writePlan.enabled, false);
        assert.equal(guardFalseOutput.writePlan.writeModeSupported, true);
        assert.deepEqual(guardFalseOutput.writePlan.tokenWriteExecutionResults, []);
        assert.equal(
          guardFalseOutput.writePlan.writeCommandPlan[0]?.blockedBy.includes("smoke_candidates"),
          true,
        );
      } finally {
        await disconnectLoadedCatchupSupervisorDb();
      }
    });
  });

  await t.test("evaluates token write runner guard synthetic cases", async () => {
    const supervisor = getLoadedCatchupSupervisorModule();
    const runnerCalls: unknown[] = [];
    const tokenWriteRunner: GeckoTokenWriteCommandRunner = async (input) => {
      runnerCalls.push(input);
      throw new Error("synthetic guard test must not call tokenWriteRunner");
    };
    const readyPlan: SyntheticWriteCommandPlan = {
      executionSupported: true,
      executionEligible: true,
      blockedBy: [],
      notify: false,
      metricAppend: false,
      postCheck: true,
    };

    assert.equal(
      supervisor.shouldRunGeckoTokenWriteRunner([readyPlan], {
        tokenWriteRunner,
      }),
      true,
    );
    assert.equal(supervisor.shouldRunGeckoTokenWriteRunner([readyPlan]), false);
    assert.equal(
      supervisor.shouldRunGeckoTokenWriteRunner([], {
        tokenWriteRunner,
      }),
      false,
    );
    assert.equal(
      supervisor.shouldRunGeckoTokenWriteRunner([readyPlan, readyPlan], {
        tokenWriteRunner,
      }),
      false,
    );

    const falseCases: Array<[string, SyntheticWriteCommandPlan]> = [
      ["executionSupported=false", { ...readyPlan, executionSupported: false }],
      ["executionEligible=false", { ...readyPlan, executionEligible: false }],
      ["blockedBy present", { ...readyPlan, blockedBy: ["write_not_requested"] }],
      ["notify=true", { ...readyPlan, notify: true }],
      ["metricAppend=true", { ...readyPlan, metricAppend: true }],
      ["postCheck=false", { ...readyPlan, postCheck: false }],
    ];

    for (const [label, plan] of falseCases) {
      assert.equal(
        supervisor.shouldRunGeckoTokenWriteRunner([plan], {
          tokenWriteRunner,
        }),
        false,
        label,
      );
    }
    assert.equal(runnerCalls.length, 0);
  });

  await t.test("validates initial write mode synthetic cases before parser reject is relaxed", async () => {
    const supervisor = getLoadedCatchupSupervisorModule();
    const baseInput = {
      writeRequested: true,
      pumpOnly: true,
      limit: 1,
      maxCycles: 1,
      stopOnNotifyCandidate: true,
      stopOnRateLimit: true,
      captureFile: null,
      cooldownSeconds: null,
      selectedCandidates: [{}],
      safetyChecks: [
        {
          name: "bounded_token_only_write",
          status: "pass" as const,
        },
      ],
      writeCommandPlan: [
        {
          notify: false,
          metricAppend: false,
          postCheck: true,
        },
      ],
    };

    assert.deepEqual(
      supervisor.validateGeckoCatchupInitialWriteMode(baseInput),
      {
        valid: true,
        blockedBy: [],
      },
    );
    assert.deepEqual(
      supervisor.validateGeckoCatchupInitialWriteMode({
        ...baseInput,
        writeRequested: false,
        limit: 2,
        maxCycles: 2,
        selectedCandidates: [{}, {}],
        safetyChecks: [
          {
            name: "stop_on_rate_limit",
            status: "warn",
          },
          {
            name: "hard_rejected_candidates",
            status: "fail",
          },
        ],
        writeCommandPlan: [
          {
            notify: true,
            metricAppend: true,
            postCheck: false,
          },
        ],
      }),
      {
        valid: false,
        blockedBy: [
          "write_not_requested",
          "limit_not_one",
          "max_cycles_not_one",
          "selected_count_not_one",
          "stop_on_rate_limit",
          "hard_rejected_candidates",
          "notify_not_supported",
          "metric_append_not_supported",
          "post_check_required",
        ],
      },
    );

    const invalidCases = [
      [
        "writeRequested=false",
        {
          ...baseInput,
          writeRequested: false,
        },
        ["write_not_requested"],
      ],
      [
        "pumpOnly=false",
        {
          ...baseInput,
          pumpOnly: false,
        },
        ["pump_only_required"],
      ],
      [
        "limit > 1",
        {
          ...baseInput,
          limit: 2,
        },
        ["limit_not_one"],
      ],
      [
        "maxCycles > 1",
        {
          ...baseInput,
          maxCycles: 2,
        },
        ["max_cycles_not_one"],
      ],
      [
        "stopOnNotifyCandidate=false",
        {
          ...baseInput,
          stopOnNotifyCandidate: false,
        },
        ["stop_on_notify_candidate_required"],
      ],
      [
        "stopOnRateLimit=false",
        {
          ...baseInput,
          stopOnRateLimit: false,
        },
        ["stop_on_rate_limit_required"],
      ],
      [
        "captureFile specified",
        {
          ...baseInput,
          captureFile: "tmp/gecko-catchup.json",
        },
        ["capture_file_not_supported"],
      ],
      [
        "cooldownSeconds specified",
        {
          ...baseInput,
          cooldownSeconds: 5,
        },
        ["cooldown_seconds_not_supported"],
      ],
      [
        "selectedCandidates.length=0",
        {
          ...baseInput,
          selectedCandidates: [],
        },
        ["selected_count_not_one"],
      ],
      [
        "selectedCandidates.length > 1",
        {
          ...baseInput,
          selectedCandidates: [{}, {}],
        },
        ["selected_count_not_one"],
      ],
      [
        "safety fail",
        {
          ...baseInput,
          safetyChecks: [
            {
              name: "hard_rejected_candidates",
              status: "fail" as const,
            },
          ],
        },
        ["hard_rejected_candidates"],
      ],
      [
        "safety warn",
        {
          ...baseInput,
          safetyChecks: [
            {
              name: "stop_on_rate_limit",
              status: "warn" as const,
            },
          ],
        },
        ["stop_on_rate_limit"],
      ],
      [
        "notify=true",
        {
          ...baseInput,
          writeCommandPlan: [
            {
              ...baseInput.writeCommandPlan[0],
              notify: true,
            },
          ],
        },
        ["notify_not_supported"],
      ],
      [
        "metricAppend=true",
        {
          ...baseInput,
          writeCommandPlan: [
            {
              ...baseInput.writeCommandPlan[0],
              metricAppend: true,
            },
          ],
        },
        ["metric_append_not_supported"],
      ],
      [
        "postCheck=false",
        {
          ...baseInput,
          writeCommandPlan: [
            {
              ...baseInput.writeCommandPlan[0],
              postCheck: false,
            },
          ],
        },
        ["post_check_required"],
      ],
    ] as const;

    for (const [label, input, blockedBy] of invalidCases) {
      assert.deepEqual(
        supervisor.validateGeckoCatchupInitialWriteMode(input),
        {
          valid: false,
          blockedBy,
        },
        label,
      );
    }

    const writeCommandPlanCountCases = [
      [],
      [baseInput.writeCommandPlan[0], baseInput.writeCommandPlan[0]],
    ];

    for (const writeCommandPlan of writeCommandPlanCountCases) {
      assert.deepEqual(
        supervisor.validateGeckoCatchupInitialWriteMode({
          ...baseInput,
          writeCommandPlan,
        }),
        {
          valid: false,
          blockedBy: ["write_command_plan_count_not_one"],
        },
      );
    }
  });

  await t.test("imports planner helpers without running the CLI entrypoint", async () => {
    const supervisor = getLoadedCatchupSupervisorModule();
    const args = supervisor.parseGeckoCatchupSupervisorArgs(["--pumpOnly", "--limit", "1"]);

    assert.equal(args.pumpOnly, true);
    assert.equal(args.limit, 1);
    assert.equal(args.dryRun, true);
    assert.equal(args.writeRequested, false);
    assert.equal(typeof supervisor.runGeckoCatchupSupervisor, "function");
    assert.equal(typeof supervisor.runGeckoCatchupSupervisorCli, "function");
    assert.equal(typeof supervisor.buildGeckoCatchupSupervisorCliDeps, "function");
    assert.equal(typeof supervisor.shouldRunGeckoTokenWriteRunner, "function");
    assert.equal(typeof supervisor.buildGeckoCatchupSupervisorCliDeps().tokenWriteRunner, "function");
  });

  await t.test("reports completed pump backlog without planning writes", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "completed.db")}`;
      await runDbPush(databaseUrl);
      await seedCompletedBacklog(databaseUrl);

      const result = await runCatchupSupervisor(
        ["--pumpOnly", "--limit", "2", "--maxCycles", "3", "--sinceMinutes", "10080", "--dry-run"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assertReadOnlyWritePlan(parsed);
      assert.equal(parsed.currentCounts.pumpTotal, 1);
      assert.equal(parsed.currentCounts.pumpComplete, 1);
      assert.equal(parsed.currentCounts.pumpIncomplete, 0);
      assert.equal(parsed.currentCounts.metricPendingCount, 0);
      assert.equal(parsed.currentCounts.latestMetricMissingCount, 0);
      assert.equal(parsed.currentCounts.skippedNonPumpCount, 1);
      assert.equal(parsed.pendingCount, 0);
      assert.equal(parsed.wouldRunCycles, 0);
      assert.deepEqual(parsed.selectedCandidates, []);
      assert.deepEqual(parsed.metricAppendPlan, []);
      assert.deepEqual(parsed.summary, {
        status: "no_pending",
        safeToWrite: false,
        plannedTokenWrites: 0,
        plannedMetricAppends: 0,
        blockingSafetyChecks: [],
        warningSafetyChecks: [],
        nextRecommendedAction: "no_action",
      });
      assert.deepEqual(parsed.writePlan.wouldWriteTokens, []);
      assert.deepEqual(parsed.writePlan.wouldAppendMetrics, []);
      assert.deepEqual(parsed.writePlan.writeCommandPlan, []);
      assert.deepEqual(parsed.writeModeReadiness, {
        readyForImplementation: true,
        supportedWriteMode: "limited_token_only_initial_check",
        blockingReasons: [],
        remainingUnsupportedWriteBehaviors: [
          "metric_append",
          "telegram_notify",
          "multi_token_write",
          "multi_cycle_write",
          "capture_file",
          "cooldown",
        ],
        nextImplementationStep: "run_first_token_only_operational_check",
      });
      assert.equal(parsed.stopReason, "no_pending_tokens");
      assert.equal(safetyStatus(parsed, "bounded_token_only_write"), "pass");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "pass");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "pass");
    });
  });

  await t.test("flags stop conditions before any write-capable mode exists", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "safety.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedSafetyStopFixture(databaseUrl);

      const result = await runCatchupSupervisor(
        ["--pumpOnly", "--limit", "2", "--maxCycles", "2", "--sinceMinutes", "10080", "--dry-run"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.currentCounts.pumpTotal, 4);
      assert.equal(parsed.currentCounts.pumpIncomplete, 3);
      assert.equal(parsed.currentCounts.metricPendingCount, 2);
      assert.equal(parsed.currentCounts.notifyCandidateCount, 1);
      assert.equal(parsed.pendingCount, 3);
      assert.equal(parsed.wouldRunCycles, 2);
      assert.equal(parsed.summary.status, "blocked");
      assert.equal(parsed.summary.safeToWrite, false);
      assert.equal(parsed.summary.plannedTokenWrites, 3);
      assert.equal(parsed.summary.plannedMetricAppends, 2);
      assert.deepEqual(parsed.summary.blockingSafetyChecks, [
        "notify_candidate_count",
        "smoke_candidates",
        "metric_append_precheck",
      ]);
      assert.deepEqual(parsed.summary.warningSafetyChecks, [
        "metric_pending_matches_incomplete",
      ]);
      assert.equal(parsed.summary.nextRecommendedAction, "inspect_blocking_safety_checks");
      assert.equal(parsed.stopReason, "notify_candidate_count");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "fail");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "warn");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "fail");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "fail");

      assert.equal(parsed.selectedCandidates[0]?.mint, seeded.smokeMint);
      assert.equal(parsed.selectedCandidates[0]?.wouldWriteToken, true);
      assert.equal(parsed.selectedCandidates[1]?.mint, seeded.metricPendingMint);
      assert.equal(parsed.selectedCandidates[1]?.metricsCount, 1);

      const smokePlan = parsed.metricAppendPlan.find((item) => item.mint === seeded.smokeMint);
      assert.equal(smokePlan?.wouldAppendMetric, true);
      assert.equal(smokePlan?.reason, "selected_incomplete_metric_missing");

      const metricPendingPlan = parsed.metricAppendPlan.find(
        (item) => item.mint === seeded.metricPendingMint,
      );
      assert.equal(metricPendingPlan?.wouldAppendMetric, false);
      assert.equal(metricPendingPlan?.reason, "already_has_metric");
    });
  });

  await t.test("plans pending selection by limit, maxCycles, and selection order", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "pending-selection.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedPendingSelectionFixture(databaseUrl);

      const result = await runCatchupSupervisor(
        ["--pumpOnly", "--limit", "2", "--maxCycles", "2", "--sinceMinutes", "10080", "--dry-run"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assertReadOnlyWritePlan(parsed);
      assert.equal(parsed.selection.pumpOnly, true);
      assert.equal(parsed.selection.limit, 2);
      assert.equal(parsed.selection.maxCycles, 2);
      assert.equal(parsed.currentCounts.pumpTotal, 5);
      assert.equal(parsed.currentCounts.pumpComplete, 0);
      assert.equal(parsed.currentCounts.pumpIncomplete, 5);
      assert.equal(parsed.currentCounts.metricPendingCount, 5);
      assert.equal(parsed.currentCounts.latestMetricMissingCount, 5);
      assert.equal(parsed.currentCounts.notifyCandidateCount, 0);
      assert.equal(parsed.pendingCount, 5);
      assert.equal(parsed.wouldRunCycles, 2);
      assert.equal(parsed.cycles.length, 2);
      assert.equal(parsed.cycles[0]?.selectedCount, 2);
      assert.equal(parsed.cycles[1]?.selectedCount, 2);
      assert.equal(parsed.selectedCandidates.length, 4);
      assert.equal(parsed.metricAppendPlan.length, 4);
      assert.deepEqual(parsed.summary, {
        status: "ready",
        safeToWrite: true,
        plannedTokenWrites: 4,
        plannedMetricAppends: 4,
        blockingSafetyChecks: [],
        warningSafetyChecks: [],
        nextRecommendedAction: "run_planned_cycles",
      });
      assert.deepEqual(
        parsed.writePlan.wouldWriteTokens.map((item) => [item.cycle, item.orderInCycle, item.mint]),
        seeded.expectedSelectedMints.map((mint, index) => [
          index < 2 ? 1 : 2,
          (index % 2) + 1,
          mint,
        ]),
      );
      assert.deepEqual(
        parsed.writePlan.wouldAppendMetrics.map((item) => [item.cycle, item.mint]),
        seeded.expectedSelectedMints.map((mint, index) => [index < 2 ? 1 : 2, mint]),
      );
      assert.deepEqual(parsed.writePlan.writeCommandPlan, [
        {
          enabled: false,
          executionSupported: true,
          executionEligible: false,
          command: "pnpm",
          script: "token:enrich-rescore:geckoterminal",
          mint: seeded.expectedSelectedMints[0],
          cycle: 1,
          orderInCycle: 1,
          notify: false,
          metricAppend: false,
          postCheck: true,
          reason: "selected_incomplete_token_write",
          blockedBy: [
            "write_not_requested",
            "limit_not_one",
            "max_cycles_not_one",
            "selected_count_not_one",
          ],
        },
      ]);
      assert.deepEqual(parsed.writePlan.recoveryHints.metricOnlyAppendCandidates, []);
      assert.deepEqual(
        parsed.selectedCandidates.map((candidate) => candidate.mint),
        seeded.expectedSelectedMints,
      );
      assert.equal(
        parsed.selectedCandidates.some((candidate) => candidate.mint === seeded.unselectedMint),
        false,
      );
      assert.deepEqual(
        parsed.selectedCandidates.map((candidate) => [candidate.cycle, candidate.orderInCycle]),
        [
          [1, 1],
          [1, 2],
          [2, 1],
          [2, 2],
        ],
      );
      assert.equal(parsed.selectedCandidates[1]?.mint, seeded.sameAnchorHigherIdMint);
      assert.equal(parsed.selectedCandidates[2]?.mint, seeded.sameAnchorLowerIdMint);
      assert.ok(
        (parsed.selectedCandidates[1]?.id ?? 0) > (parsed.selectedCandidates[2]?.id ?? 0),
        "same-anchor candidates must be ordered by id desc",
      );

      for (const candidate of parsed.selectedCandidates) {
        assert.equal(candidate.currentSource, GECKO_SOURCE);
        assert.equal(candidate.originSource, GECKO_SOURCE);
        assert.equal(candidate.metadataStatus, "mint_only");
        assert.equal(candidate.name, null);
        assert.equal(candidate.symbol, null);
        assert.equal(candidate.scoreRank, "C");
        assert.equal(candidate.scoreTotal, 0);
        assert.equal(candidate.hardRejected, false);
        assert.equal(candidate.metricsCount, 0);
        assert.equal(candidate.latestMetric, null);
        assert.equal(candidate.wouldWriteToken, true);
      }

      for (const plan of parsed.metricAppendPlan) {
        assert.equal(plan.wouldAppendMetric, true);
        assert.equal(plan.reason, "selected_incomplete_metric_missing");
        assert.equal(plan.metricsCount, 0);
        assert.equal(plan.latestMetric, null);
      }

      assert.equal(parsed.stopReason, "max_cycles_reached_after_plan");
      assert.equal(safetyStatus(parsed, "bounded_token_only_write"), "pass");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "pass");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "pass");
      assert.equal(safetyStatus(parsed, "source_origin"), "pass");
      assert.equal(safetyStatus(parsed, "selected_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "pass");
      assert.equal(safetyStatus(parsed, "stop_on_rate_limit"), "pass");
    });
  });

  await t.test("keeps initial token-only write plan ineligible until --write is requested", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "initial-token-write-plan.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedPendingSelectionFixture(databaseUrl);

      const result = await runCatchupSupervisor(
        ["--pumpOnly", "--limit", "1", "--maxCycles", "1", "--sinceMinutes", "10080", "--dry-run"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assertReadOnlyWritePlan(parsed);
      assert.equal(parsed.selection.limit, 1);
      assert.equal(parsed.selection.maxCycles, 1);
      assert.equal(parsed.selectedCandidates.length, 1);
      assert.equal(parsed.selectedCandidates[0]?.mint, seeded.expectedSelectedMints[0]);
      assert.deepEqual(parsed.summary, {
        status: "ready",
        safeToWrite: true,
        plannedTokenWrites: 1,
        plannedMetricAppends: 1,
        blockingSafetyChecks: [],
        warningSafetyChecks: [],
        nextRecommendedAction: "run_planned_cycles",
      });
      assert.deepEqual(parsed.writePlan.wouldWriteTokens, [
        {
          cycle: 1,
          orderInCycle: 1,
          mint: seeded.expectedSelectedMints[0],
        },
      ]);
      assert.deepEqual(parsed.writePlan.wouldAppendMetrics, [
        {
          cycle: 1,
          mint: seeded.expectedSelectedMints[0],
        },
      ]);

      const [plan] = parsed.writePlan.writeCommandPlan;
      assert.ok(plan);
      assert.equal(plan.executionSupported, true);
      assert.equal(plan.executionEligible, false);
      assert.equal(plan.notify, false);
      assert.equal(plan.metricAppend, false);
      assert.equal(plan.postCheck, true);
      assert.equal(plan.mint, seeded.expectedSelectedMints[0]);
      assert.equal("args" in plan, false);
      assert.deepEqual(plan.blockedBy, ["write_not_requested"]);
      assert.equal(plan.blockedBy.includes("limit_not_one"), false);
      assert.equal(plan.blockedBy.includes("max_cycles_not_one"), false);
      assert.equal(plan.blockedBy.includes("selected_count_not_one"), false);

      const executablePlan = {
        ...plan,
        executionSupported: true,
        executionEligible: true,
        blockedBy: [],
      };
      const supervisor = getLoadedCatchupSupervisorModule();
      const mockResult = parseGeckoTokenWriteCommandResult({
        exitCode: 0,
        stdout: JSON.stringify({
          items: [
            {
              mint: executablePlan.mint,
              notifySent: false,
              writeSummary: {
                enrichUpdated: true,
                rescoreUpdated: true,
                contextUpdated: true,
                metaplexContextUpdated: true,
              },
            },
          ],
          summary: {
            notifySentCount: 0,
            rateLimited: false,
            abortedDueToRateLimit: false,
            skippedAfterRateLimit: 0,
          },
        }),
        stderr: "[token:enrich-rescore:geckoterminal] synthetic mock runner",
      });
      const runnerCalls: unknown[] = [];
      const tokenWriteRunner: GeckoTokenWriteCommandRunner = async (input) => {
        runnerCalls.push(input);
        return mockResult;
      };

      assert.equal(
        supervisor.shouldRunGeckoTokenWriteRunner([executablePlan], {
          tokenWriteRunner,
        }),
        true,
      );

      const runnerInput = buildGeckoTokenWriteRunnerInput(
        {
          ...executablePlan,
          args: expectedTokenWriteArgs(executablePlan.mint),
        },
        {
          cwd: process.cwd(),
          env: {
            DATABASE_URL: databaseUrl,
          },
        },
      );
      assert.equal(runnerInput.command, "pnpm");
      assert.deepEqual(runnerInput.args, expectedTokenWriteArgs(seeded.expectedSelectedMints[0]));
      assert.equal(runnerInput.args.includes("--mint"), true);
      assert.equal(runnerInput.args.includes(seeded.expectedSelectedMints[0]), true);
      assert.equal(runnerInput.args.includes("--write"), true);
      assert.equal(runnerInput.args.includes("--notify"), false);
      assert.equal(runnerInput.args.some((arg) => arg.includes("metric")), false);
      assert.equal(runnerInput.mint, parsed.selectedCandidates[0]?.mint);
      assert.equal(runnerInput.cycle, plan.cycle);
      assert.equal(runnerInput.orderInCycle, plan.orderInCycle);
      assert.equal(runnerInput.notify, false);
      assert.equal(runnerInput.metricAppend, false);
      assert.equal(runnerInput.postCheck, true);

      const runnerResult = await runGeckoTokenWriteCommandWithRunner(tokenWriteRunner, runnerInput);
      assert.equal(runnerResult, mockResult);
      assert.deepEqual(runnerCalls, [runnerInput]);

      const executionResult = toGeckoCatchupTokenWriteExecutionResult(runnerInput, runnerResult);
      const syntheticWritePlan = {
        ...parsed.writePlan,
        tokenWriteExecutionResults: [executionResult],
      };

      assert.deepEqual(parsed.writePlan.tokenWriteExecutionResults, []);
      assert.equal(syntheticWritePlan.tokenWriteExecutionResults.length, 1);
      assert.deepEqual(syntheticWritePlan.tokenWriteExecutionResults[0], executionResult);
      assert.deepEqual(syntheticWritePlan.tokenWriteExecutionResults[0], {
        mint: seeded.expectedSelectedMints[0],
        cycle: plan.cycle,
        orderInCycle: plan.orderInCycle,
        status: "ok",
        exitCode: 0,
        rateLimited: false,
        abortedDueToRateLimit: false,
        skippedAfterRateLimit: 0,
        writeSummary: {
          enrichUpdated: true,
          rescoreUpdated: true,
          contextUpdated: true,
          metaplexContextUpdated: true,
        },
        notifySent: false,
        itemError: null,
        metaplexErrorKind: null,
        parseError: null,
      });
      assert.equal("stdout" in syntheticWritePlan.tokenWriteExecutionResults[0], false);
      assert.equal("stderr" in syntheticWritePlan.tokenWriteExecutionResults[0], false);
      assert.equal("parsedOutput" in syntheticWritePlan.tokenWriteExecutionResults[0], false);
      assert.equal("env" in syntheticWritePlan.tokenWriteExecutionResults[0], false);
      assert.equal("cwd" in syntheticWritePlan.tokenWriteExecutionResults[0], false);
      assert.equal("args" in syntheticWritePlan.tokenWriteExecutionResults[0], false);
      assert.equal("command" in syntheticWritePlan.tokenWriteExecutionResults[0], false);

      assert.equal(safetyStatus(parsed, "bounded_token_only_write"), "pass");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "pass");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "pass");
      assert.equal(safetyStatus(parsed, "source_origin"), "pass");
      assert.equal(safetyStatus(parsed, "selected_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "pass");
      assert.equal(safetyStatus(parsed, "stop_on_rate_limit"), "pass");
    });
  });

  await t.test("keeps warning write command plans blocked and ineligible", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "warning-token-write-plan.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedPendingSelectionFixture(databaseUrl);

      const result = await runCatchupSupervisor(
        [
          "--pumpOnly",
          "--limit",
          "1",
          "--maxCycles",
          "1",
          "--sinceMinutes",
          "10080",
          "--stopOnRateLimit",
          "false",
          "--dry-run",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assertReadOnlyWritePlan(parsed);
      assert.equal(parsed.selection.limit, 1);
      assert.equal(parsed.selection.maxCycles, 1);
      assert.equal(parsed.selectedCandidates.length, 1);
      assert.equal(parsed.selectedCandidates[0]?.mint, seeded.expectedSelectedMints[0]);
      assert.deepEqual(parsed.summary, {
        status: "warning",
        safeToWrite: false,
        plannedTokenWrites: 1,
        plannedMetricAppends: 1,
        blockingSafetyChecks: [],
        warningSafetyChecks: ["stop_on_rate_limit"],
        nextRecommendedAction: "inspect_warning_safety_checks",
      });

      const [plan] = parsed.writePlan.writeCommandPlan;
      assert.ok(plan);
      assert.equal(plan.executionSupported, true);
      assert.equal(plan.executionEligible, false);
      assert.equal(plan.notify, false);
      assert.equal(plan.metricAppend, false);
      assert.equal(plan.postCheck, true);
      assert.equal(plan.mint, seeded.expectedSelectedMints[0]);
      assert.deepEqual(plan.blockedBy, ["write_not_requested", "stop_on_rate_limit"]);
      assert.equal(plan.blockedBy.includes("limit_not_one"), false);
      assert.equal(plan.blockedBy.includes("max_cycles_not_one"), false);
      assert.equal(plan.blockedBy.includes("selected_count_not_one"), false);
      assert.equal(safetyStatus(parsed, "stop_on_rate_limit"), "warn");
      assert.equal(safetyStatus(parsed, "bounded_token_only_write"), "pass");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "pass");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "pass");
      assert.equal(safetyStatus(parsed, "source_origin"), "pass");
      assert.equal(safetyStatus(parsed, "selected_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "pass");
    });
  });

  await t.test("flags unsafe selected candidates and skips unselectable rows", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "unsafe-candidates.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedUnsafeCandidateFixture(databaseUrl);

      const result = await runCatchupSupervisor(
        ["--pumpOnly", "--limit", "3", "--maxCycles", "1", "--sinceMinutes", "10080", "--dry-run"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.currentCounts.pumpTotal, 4);
      assert.equal(parsed.currentCounts.pumpComplete, 1);
      assert.equal(parsed.currentCounts.pumpIncomplete, 3);
      assert.equal(parsed.currentCounts.metricPendingCount, 3);
      assert.equal(parsed.currentCounts.metricTokenCount, 1);
      assert.equal(parsed.currentCounts.notifyCandidateCount, 0);
      assert.equal(parsed.pendingCount, 3);
      assert.equal(parsed.wouldRunCycles, 1);
      assert.equal(parsed.selectedCandidates.length, 3);
      assert.equal(parsed.metricAppendPlan.length, 3);
      assert.equal(parsed.summary.status, "blocked");
      assert.equal(parsed.summary.safeToWrite, false);
      assert.equal(parsed.summary.plannedTokenWrites, 3);
      assert.equal(parsed.summary.plannedMetricAppends, 2);
      assert.deepEqual(parsed.summary.blockingSafetyChecks, [
        "smoke_candidates",
        "hard_rejected_candidates",
        "metric_append_precheck",
      ]);
      assert.deepEqual(parsed.summary.warningSafetyChecks, []);
      assert.equal(parsed.summary.nextRecommendedAction, "inspect_blocking_safety_checks");
      assert.deepEqual(
        parsed.writePlan.wouldWriteTokens.map((item) => item.mint),
        [seeded.smokeMint, seeded.metricPresentMint, seeded.hardRejectedMint],
      );
      assert.deepEqual(
        parsed.writePlan.wouldAppendMetrics.map((item) => item.mint),
        [seeded.smokeMint, seeded.hardRejectedMint],
      );
      assert.deepEqual(parsed.writePlan.writeCommandPlan, [
        {
          enabled: false,
          executionSupported: true,
          executionEligible: false,
          command: "pnpm",
          script: "token:enrich-rescore:geckoterminal",
          mint: seeded.smokeMint,
          cycle: 1,
          orderInCycle: 1,
          notify: false,
          metricAppend: false,
          postCheck: true,
          reason: "selected_incomplete_token_write",
          blockedBy: [
            "write_not_requested",
            "limit_not_one",
            "selected_count_not_one",
            "smoke_candidates",
            "hard_rejected_candidates",
            "metric_append_precheck",
          ],
        },
      ]);
      assert.deepEqual(
        parsed.selectedCandidates.map((candidate) => candidate.mint),
        [seeded.smokeMint, seeded.metricPresentMint, seeded.hardRejectedMint],
      );
      assert.equal(
        parsed.selectedCandidates.some((candidate) => candidate.mint === seeded.completeMint),
        false,
      );
      assert.equal(
        parsed.selectedCandidates.some((candidate) => candidate.mint === seeded.nonGeckoMint),
        false,
      );

      const smokePlan = parsed.metricAppendPlan.find((item) => item.mint === seeded.smokeMint);
      assert.equal(smokePlan?.wouldAppendMetric, true);
      assert.equal(smokePlan?.reason, "selected_incomplete_metric_missing");
      assert.equal(smokePlan?.metricsCount, 0);
      assert.equal(smokePlan?.latestMetric, null);

      const metricPresentCandidate = parsed.selectedCandidates.find(
        (candidate) => candidate.mint === seeded.metricPresentMint,
      );
      assert.equal(metricPresentCandidate?.metricsCount, 1);
      assert.notEqual(metricPresentCandidate?.latestMetric, null);

      const metricPresentPlan = parsed.metricAppendPlan.find(
        (item) => item.mint === seeded.metricPresentMint,
      );
      assert.equal(metricPresentPlan?.wouldAppendMetric, false);
      assert.equal(metricPresentPlan?.reason, "already_has_metric");
      assert.equal(metricPresentPlan?.metricsCount, 1);
      assert.notEqual(metricPresentPlan?.latestMetric, null);

      const hardRejectedCandidate = parsed.selectedCandidates.find(
        (candidate) => candidate.mint === seeded.hardRejectedMint,
      );
      assert.equal(hardRejectedCandidate?.hardRejected, true);
      assert.equal(hardRejectedCandidate?.metricsCount, 0);
      assert.equal(hardRejectedCandidate?.latestMetric, null);

      assert.equal(parsed.stopReason, "smoke_candidates");
      assert.equal(safetyStatus(parsed, "bounded_token_only_write"), "pass");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "pass");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "fail");
      assert.equal(safetyStatus(parsed, "source_origin"), "pass");
      assert.equal(safetyStatus(parsed, "selected_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "hard_rejected_candidates"), "fail");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "fail");
      assert.equal(safetyStatus(parsed, "stop_on_rate_limit"), "pass");
    });
  });

  await t.test("stops on hardRejected selected candidates", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "hard-rejected.db")}`;
      await runDbPush(databaseUrl);
      const seeded = await seedHardRejectedOnlyFixture(databaseUrl);

      const result = await runCatchupSupervisor(
        ["--pumpOnly", "--limit", "1", "--maxCycles", "1", "--sinceMinutes", "10080", "--dry-run"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as CatchupSupervisorOutput;
      assertReadOnlyWritePlan(parsed);
      assert.equal(parsed.currentCounts.pumpTotal, 1);
      assert.equal(parsed.currentCounts.pumpIncomplete, 1);
      assert.equal(parsed.currentCounts.metricPendingCount, 1);
      assert.equal(parsed.pendingCount, 1);
      assert.equal(parsed.selectedCandidates.length, 1);
      assert.equal(parsed.selectedCandidates[0]?.mint, seeded.hardRejectedMint);
      assert.equal(parsed.selectedCandidates[0]?.hardRejected, true);
      assert.deepEqual(parsed.summary, {
        status: "blocked",
        safeToWrite: false,
        plannedTokenWrites: 1,
        plannedMetricAppends: 1,
        blockingSafetyChecks: ["hard_rejected_candidates"],
        warningSafetyChecks: [],
        nextRecommendedAction: "inspect_blocking_safety_checks",
      });
      assert.deepEqual(parsed.writePlan.wouldWriteTokens, [
        {
          cycle: 1,
          orderInCycle: 1,
          mint: seeded.hardRejectedMint,
        },
      ]);
      assert.deepEqual(parsed.writePlan.wouldAppendMetrics, [
        {
          cycle: 1,
          mint: seeded.hardRejectedMint,
        },
      ]);
      assert.deepEqual(parsed.writePlan.writeCommandPlan, [
        {
          enabled: false,
          executionSupported: true,
          executionEligible: false,
          command: "pnpm",
          script: "token:enrich-rescore:geckoterminal",
          mint: seeded.hardRejectedMint,
          cycle: 1,
          orderInCycle: 1,
          notify: false,
          metricAppend: false,
          postCheck: true,
          reason: "selected_incomplete_token_write",
          blockedBy: ["write_not_requested", "hard_rejected_candidates"],
        },
      ]);
      assert.equal(parsed.stopReason, "hard_rejected_candidates");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "pass");
      assert.equal(safetyStatus(parsed, "source_origin"), "pass");
      assert.equal(safetyStatus(parsed, "selected_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "hard_rejected_candidates"), "fail");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "pass");
    });
  });

  await t.test("parses only gated write requests before execution is enabled", async () => {
    const supervisor = getLoadedCatchupSupervisorModule();
    const rejectedWriteArgCases = [
      ["--write"],
      ["--write", "--limit", "1"],
      ["--write", "--maxCycles", "1"],
      ["--write", "--limit", "1", "--maxCycles", "1"],
      ["--write", "--pumpOnly", "--limit", "2", "--maxCycles", "1"],
      ["--write", "--pumpOnly", "--limit", "1", "--maxCycles", "2"],
      [
        "--write",
        "--pumpOnly",
        "--limit",
        "1",
        "--maxCycles",
        "1",
        "--stopOnRateLimit",
        "false",
      ],
      [
        "--write",
        "--pumpOnly",
        "--limit",
        "1",
        "--maxCycles",
        "1",
        "--stopOnNotifyCandidate",
        "false",
      ],
      [
        "--write",
        "--pumpOnly",
        "--limit",
        "1",
        "--maxCycles",
        "1",
        "--captureFile",
        "tmp/gecko-catchup.json",
      ],
      [
        "--write",
        "--pumpOnly",
        "--limit",
        "1",
        "--maxCycles",
        "1",
        "--cooldownSeconds",
        "5",
      ],
    ];

    for (const args of rejectedWriteArgCases) {
      assert.throws(
        () => supervisor.parseGeckoCatchupSupervisorArgs(args),
        /--write is only supported for initial gated token write requests/,
        `expected parser failure for args: ${args.join(" ")}`,
      );
    }

    const acceptedWriteArgCases = [
      ["--write", "--pumpOnly", "--limit", "1", "--maxCycles", "1"],
      ["--pumpOnly", "--limit", "1", "--maxCycles", "1", "--write"],
      [
        "--write",
        "--pumpOnly",
        "--limit",
        "1",
        "--maxCycles",
        "1",
        "--stopOnRateLimit",
        "true",
        "--stopOnNotifyCandidate",
        "true",
      ],
    ];

    for (const args of acceptedWriteArgCases) {
      const parsed = supervisor.parseGeckoCatchupSupervisorArgs(args);

      assert.equal(parsed.writeRequested, true, `expected writeRequested for args: ${args.join(" ")}`);
      assert.equal(parsed.pumpOnly, true);
      assert.equal(parsed.limit, 1);
      assert.equal(parsed.maxCycles, 1);
      assert.equal(parsed.stopOnRateLimit, true);
      assert.equal(parsed.stopOnNotifyCandidate, true);
      assert.equal(parsed.captureFile, null);
      assert.equal(parsed.cooldownSeconds, null);
    }
  });
});
