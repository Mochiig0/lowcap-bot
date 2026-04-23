import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

type ManualTargetRow = {
  mint: string;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  pendingAgeMinutes: number;
  reviewFlagsCount: number;
  queuesMatched: string[];
  latestMetricObservedAt: string | null;
  latestMetricSource: string | null;
};

type ManualTargetsGeckoterminalOutput = {
  readOnly: boolean;
  originSource: string;
  selection: {
    sinceHours: number;
    limit: number;
    pumpOnly: boolean;
    staleAfterHours: number;
    sinceCutoff: string;
    geckoOriginTokenCount: number;
    pumpFilteredTokenCount: number;
    excludedSmokeCount: number;
    eligibleManualTargetCount: number;
    selectedCount: number;
  };
  summary: {
    selectedCount: number;
    selectionAnchorKindCounts: Record<string, number>;
    reviewFlagsCountDistribution: Record<string, number>;
  };
  representativeRows: ManualTargetRow[];
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-manual-targets-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
  await execFileAsync(
    "bash",
    ["-lc", "pnpm exec prisma db push --skip-generate"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runManualTargetsGeckoterminal(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-manual-targets-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-manual-targets-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalManualTargets.ts",
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

async function seedManualTargets(databaseUrl: string): Promise<{
  targetMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = Date.now();
    const staleAt = new Date(now - 7 * 60 * 60 * 1_000);
    const targetMint = "GeckoManualTarget111111111111111111111111111111pump";

    await db.token.create({
      data: {
        mint: targetMint,
        source: GECKO_SOURCE,
        name: "Manual Target Token",
        symbol: "MTT",
        metadataStatus: "partial",
        createdAt: staleAt,
        importedAt: staleAt,
        enrichedAt: staleAt,
        rescoredAt: staleAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: staleAt.toISOString(),
          },
        },
        reviewFlagsJson: {
          hasWebsite: true,
          hasX: false,
          hasTelegram: false,
          metaplexHit: false,
          descriptionPresent: true,
          linkCount: 1,
        },
      },
    });

    await db.token.create({
      data: {
        mint: "SMOKE_GeckoManualTargetExcluded",
        source: GECKO_SOURCE,
        name: "Smoke Manual Target",
        symbol: "SMT",
        metadataStatus: "partial",
        createdAt: staleAt,
        importedAt: staleAt,
        enrichedAt: staleAt,
        rescoredAt: staleAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: staleAt.toISOString(),
          },
        },
      },
    });

    await db.token.create({
      data: {
        mint: "NonGeckoManualTarget11111111111111111111111111111",
        source: "manual",
        name: "Other Target",
        symbol: "OTH",
        metadataStatus: "partial",
        createdAt: staleAt,
        importedAt: staleAt,
        enrichedAt: staleAt,
        rescoredAt: staleAt,
      },
    });

    return {
      targetMint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("manualTargetsGeckoterminal boundary", async (t) => {
  await t.test("returns manual targets with stable top-level fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedManualTargets(databaseUrl);

      const result = await runManualTargetsGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "10",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ManualTargetsGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.sinceHours, 24);
      assert.equal(parsed.selection.limit, 10);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.staleAfterHours, 6);
      assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.selection.geckoOriginTokenCount, 2);
      assert.equal(parsed.selection.pumpFilteredTokenCount, 2);
      assert.equal(parsed.selection.excludedSmokeCount, 1);
      assert.equal(parsed.selection.eligibleManualTargetCount, 1);
      assert.equal(parsed.selection.selectedCount, 1);

      assert.equal(parsed.summary.selectedCount, 1);
      assert.deepEqual(parsed.summary.selectionAnchorKindCounts, {
        firstSeenDetectedAt: 1,
      });
      assert.deepEqual(parsed.summary.reviewFlagsCountDistribution, {
        "3": 1,
      });

      assert.equal(parsed.representativeRows.length, 1);
      assert.equal(parsed.representativeRows[0]?.mint, seeded.targetMint);
      assert.equal(parsed.representativeRows[0]?.name, "Manual Target Token");
      assert.equal(parsed.representativeRows[0]?.symbol, "MTT");
      assert.equal(parsed.representativeRows[0]?.metadataStatus, "partial");
      assert.equal(parsed.representativeRows[0]?.selectionAnchorKind, "firstSeenDetectedAt");
      assert.equal(parsed.representativeRows[0]?.reviewFlagsCount, 3);
      assert.deepEqual(parsed.representativeRows[0]?.queuesMatched, [
        "staleReview",
        "metricPending",
      ]);
      assert.equal(parsed.representativeRows[0]?.latestMetricObservedAt, null);
      assert.equal(parsed.representativeRows[0]?.latestMetricSource, null);
      assert.equal(parsed.representativeRows[0]!.pendingAgeMinutes >= 6 * 60, true);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runManualTargetsGeckoterminal(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm review:manual-targets:geckoterminal -- \[--sinceHours <N>\] \[--limit <N>\] \[--pumpOnly\]/,
    );
  });

  await t.test("returns an empty result when no gecko manual target matches", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runManualTargetsGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "10",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ManualTargetsGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.geckoOriginTokenCount, 0);
      assert.equal(parsed.selection.pumpFilteredTokenCount, 0);
      assert.equal(parsed.selection.excludedSmokeCount, 0);
      assert.equal(parsed.selection.eligibleManualTargetCount, 0);
      assert.equal(parsed.selection.selectedCount, 0);
      assert.equal(parsed.summary.selectedCount, 0);
      assert.deepEqual(parsed.summary.selectionAnchorKindCounts, {});
      assert.deepEqual(parsed.summary.reviewFlagsCountDistribution, {});
      assert.deepEqual(parsed.representativeRows, []);
    });
  });
});
