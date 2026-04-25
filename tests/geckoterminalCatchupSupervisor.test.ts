import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

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
    mint: string;
    name: string | null;
    symbol: string | null;
    metricsCount: number;
    wouldWriteToken: boolean;
  }>;
  metricAppendPlan: Array<{
    cycle: number;
    mint: string;
    wouldAppendMetric: boolean;
    reason: string;
    metricsCount: number;
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

test("geckoterminal catch-up supervisor dry-run", async (t) => {
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
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
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

  await t.test("rejects write mode explicitly", async () => {
    const result = await runCatchupSupervisor(["--write"]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--write is not supported for ops:catchup:gecko yet/);
  });
});
