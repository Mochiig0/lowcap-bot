import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import { parseGeckoCatchupSupervisorArgs } from "../src/cli/geckoterminalCatchupSupervisor.ts";
import { buildGeckoTokenWriteRunnerInput } from "../src/cli/geckoterminalCatchupTokenWriteRunner.ts";

const execFileAsync = promisify(execFile);

const GECKO_SOURCE = "geckoterminal.new_pools";

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
    enabled: false;
    writeModeSupported: false;
    recommendedInitialWriteArgs: {
      limit: 1;
      maxCycles: 1;
      postCheck: true;
      requireMetricAppend: true;
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
      enabled: false;
      executionSupported: false;
      executionEligible: false;
      command: "pnpm";
      script: "token:enrich-rescore:geckoterminal";
      args: string[];
      mint: string;
      cycle: number;
      orderInCycle: number;
      notify: false;
      metricAppend: false;
      postCheck: true;
      reason: "selected_incomplete_token_write";
      blockedBy: string[];
    }>;
    requiresCaptureOnly: true;
    postCheckPlan: {
      enabled: true;
      requireMetricPendingMatchesIncomplete: true;
      requireSelectedLatestMetricPresent: true;
    };
    recoveryHints: {
      metricOnlyAppendCandidates: string[];
      cooldownRecommended: true;
      resumeWithLimit: 1;
      resumeWithMaxCycles: 1;
    };
  };
  writeModeReadiness: {
    readyForImplementation: false;
    blockingReasons: [
      "metric_append_helper_not_extracted",
      "write_gate_still_disabled",
    ];
    nextImplementationStep: "review_supervisor_write_gate";
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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

function assertReadOnlyWritePlan(output: CatchupSupervisorOutput): void {
  assert.equal(output.readOnly, true);
  assert.equal(output.dryRun, true);
  assert.equal(output.writeEnabled, false);
  assert.equal(output.writePlan.enabled, false);
  assert.equal(output.writePlan.writeModeSupported, false);
  assert.deepEqual(output.writePlan.recommendedInitialWriteArgs, {
    limit: 1,
    maxCycles: 1,
    postCheck: true,
    requireMetricAppend: true,
  });
  assert.deepEqual(output.writePlan.recommendedInitialTokenWriteArgs, {
    limit: 1,
    maxCycles: 1,
    postCheck: true,
    notify: false,
    metricAppend: false,
  });
  assert.equal(output.writePlan.requiresCaptureOnly, true);
  assert.deepEqual(output.writePlan.postCheckPlan, {
    enabled: true,
    requireMetricPendingMatchesIncomplete: true,
    requireSelectedLatestMetricPresent: true,
  });
  assert.deepEqual(output.writePlan.recoveryHints, {
    metricOnlyAppendCandidates: [],
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
  await t.test("imports planner helpers without running the CLI entrypoint", () => {
    const args = parseGeckoCatchupSupervisorArgs(["--pumpOnly", "--limit", "1"]);

    assert.equal(args.pumpOnly, true);
    assert.equal(args.limit, 1);
    assert.equal(args.dryRun, true);
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
        readyForImplementation: false,
        blockingReasons: [
          "metric_append_helper_not_extracted",
          "write_gate_still_disabled",
        ],
        nextImplementationStep: "review_supervisor_write_gate",
      });
      assert.equal(parsed.stopReason, "no_pending_tokens");
      assert.equal(safetyStatus(parsed, "dry_run_only"), "pass");
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
          executionSupported: false,
          executionEligible: false,
          command: "pnpm",
          script: "token:enrich-rescore:geckoterminal",
          args: [
            "token:enrich-rescore:geckoterminal",
            "--",
            "--mint",
            seeded.expectedSelectedMints[0],
            "--write",
          ],
          mint: seeded.expectedSelectedMints[0],
          cycle: 1,
          orderInCycle: 1,
          notify: false,
          metricAppend: false,
          postCheck: true,
          reason: "selected_incomplete_token_write",
          blockedBy: [
            "write_gate_still_disabled",
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
      assert.equal(safetyStatus(parsed, "dry_run_only"), "pass");
      assert.equal(safetyStatus(parsed, "notify_candidate_count"), "pass");
      assert.equal(safetyStatus(parsed, "metric_pending_matches_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "smoke_candidates"), "pass");
      assert.equal(safetyStatus(parsed, "source_origin"), "pass");
      assert.equal(safetyStatus(parsed, "selected_incomplete"), "pass");
      assert.equal(safetyStatus(parsed, "metric_append_precheck"), "pass");
      assert.equal(safetyStatus(parsed, "stop_on_rate_limit"), "pass");
    });
  });

  await t.test("keeps initial token-only write plan ineligible until write gate unlocks", async () => {
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
      assert.equal(plan.executionSupported, false);
      assert.equal(plan.executionEligible, false);
      assert.equal(plan.notify, false);
      assert.equal(plan.metricAppend, false);
      assert.equal(plan.postCheck, true);
      assert.equal(plan.mint, seeded.expectedSelectedMints[0]);
      assert.deepEqual(plan.args, [
        "token:enrich-rescore:geckoterminal",
        "--",
        "--mint",
        seeded.expectedSelectedMints[0],
        "--write",
      ]);
      assert.equal(plan.args.includes("--notify"), false);
      assert.equal(plan.args.some((arg) => arg.includes("metric")), false);
      assert.deepEqual(plan.blockedBy, ["write_gate_still_disabled"]);
      assert.equal(plan.blockedBy.includes("limit_not_one"), false);
      assert.equal(plan.blockedBy.includes("max_cycles_not_one"), false);
      assert.equal(plan.blockedBy.includes("selected_count_not_one"), false);

      const runnerInput = buildGeckoTokenWriteRunnerInput(plan, {
        cwd: process.cwd(),
        env: {
          DATABASE_URL: databaseUrl,
        },
      });
      assert.equal(runnerInput.command, "pnpm");
      assert.deepEqual(runnerInput.args, [
        "token:enrich-rescore:geckoterminal",
        "--",
        "--mint",
        seeded.expectedSelectedMints[0],
        "--write",
      ]);
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

      assert.equal(safetyStatus(parsed, "dry_run_only"), "pass");
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
      assert.equal(plan.executionSupported, false);
      assert.equal(plan.executionEligible, false);
      assert.equal(plan.notify, false);
      assert.equal(plan.metricAppend, false);
      assert.equal(plan.postCheck, true);
      assert.equal(plan.mint, seeded.expectedSelectedMints[0]);
      assert.deepEqual(plan.blockedBy, ["write_gate_still_disabled", "stop_on_rate_limit"]);
      assert.equal(plan.blockedBy.includes("limit_not_one"), false);
      assert.equal(plan.blockedBy.includes("max_cycles_not_one"), false);
      assert.equal(plan.blockedBy.includes("selected_count_not_one"), false);
      assert.equal(safetyStatus(parsed, "stop_on_rate_limit"), "warn");
      assert.equal(safetyStatus(parsed, "dry_run_only"), "pass");
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
          executionSupported: false,
          executionEligible: false,
          command: "pnpm",
          script: "token:enrich-rescore:geckoterminal",
          args: [
            "token:enrich-rescore:geckoterminal",
            "--",
            "--mint",
            seeded.smokeMint,
            "--write",
          ],
          mint: seeded.smokeMint,
          cycle: 1,
          orderInCycle: 1,
          notify: false,
          metricAppend: false,
          postCheck: true,
          reason: "selected_incomplete_token_write",
          blockedBy: [
            "write_gate_still_disabled",
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
      assert.equal(safetyStatus(parsed, "dry_run_only"), "pass");
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
          executionSupported: false,
          executionEligible: false,
          command: "pnpm",
          script: "token:enrich-rescore:geckoterminal",
          args: [
            "token:enrich-rescore:geckoterminal",
            "--",
            "--mint",
            seeded.hardRejectedMint,
            "--write",
          ],
          mint: seeded.hardRejectedMint,
          cycle: 1,
          orderInCycle: 1,
          notify: false,
          metricAppend: false,
          postCheck: true,
          reason: "selected_incomplete_token_write",
          blockedBy: ["write_gate_still_disabled", "hard_rejected_candidates"],
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

  await t.test("rejects write mode explicitly", async () => {
    const writeArgCases = [
      ["--write"],
      ["--write", "--limit", "1"],
      ["--write", "--maxCycles", "1"],
      ["--write", "--limit", "1", "--maxCycles", "1"],
      ["--write", "--pumpOnly", "--limit", "1", "--maxCycles", "1"],
      ["--limit", "1", "--maxCycles", "1", "--write"],
    ];

    for (const args of writeArgCases) {
      const result = await runCatchupSupervisor(args);

      assert.equal(result.ok, false, `expected failure for args: ${args.join(" ")}`);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /--write is not supported for ops:catchup:gecko yet/);
    }
  });
});
