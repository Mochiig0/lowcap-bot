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

type PendingShapeItem = {
  mint: string;
  metadataStatus: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  pendingAgeMinutes: number;
  reviewFlagsCount: number;
  queuesMatched: string[];
};

type PendingShapeGeckoterminalOutput = {
  readOnly: boolean;
  originSource: string;
  selection: {
    sinceHours: number;
    limit: number;
    pumpOnly: boolean;
    metadataStatus: "mint_only" | "partial" | "enriched" | null;
    minReviewFlagsCount: number;
    staleAfterHours: number;
    sinceCutoff: string;
    geckoOriginTokenCount: number;
    pumpFilteredTokenCount: number;
    excludedSmokeCount: number;
    eligiblePendingCount: number;
    filteredPendingCount: number;
    selectedPendingCount: number;
  };
  summary: {
    metadataStatusCounts: Record<string, number>;
    selectionAnchorKindCounts: Record<string, number>;
    reviewFlagsCountDistribution: Record<string, number>;
    queuesMatchedPatternCounts: Record<string, number>;
  };
  representativeRows: PendingShapeItem[];
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-pending-shape-test-"));

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

async function runPendingShapeGeckoterminal(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-pending-shape-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-pending-shape-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalPendingShape.ts",
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

async function seedPendingShape(databaseUrl: string): Promise<{
  partialMint: string;
  mintOnlyMint: string;
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
    const partialAt = new Date(now - 7 * 60 * 60 * 1_000);
    const mintOnlyAt = new Date(now - 8 * 60 * 60 * 1_000);

    const partialMint = "GeckoPendingShape1111111111111111111111111111111";
    const mintOnlyMint = "GeckoPendingShape2222222222222222222222222222222";

    await db.token.create({
      data: {
        mint: partialMint,
        source: GECKO_SOURCE,
        name: "Pending Shape Partial",
        symbol: "PSP",
        metadataStatus: "partial",
        createdAt: partialAt,
        importedAt: partialAt,
        enrichedAt: partialAt,
        rescoredAt: partialAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: partialAt.toISOString(),
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
        mint: mintOnlyMint,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        createdAt: mintOnlyAt,
        importedAt: mintOnlyAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: mintOnlyAt.toISOString(),
          },
        },
      },
    });

    await db.token.create({
      data: {
        mint: "SMOKE_GeckoPendingShapeExcluded",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        createdAt: partialAt,
        importedAt: partialAt,
        enrichedAt: partialAt,
        rescoredAt: partialAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: partialAt.toISOString(),
          },
        },
      },
    });

    await db.token.create({
      data: {
        mint: "NonGeckoPendingShape111111111111111111111111111111",
        source: "manual",
        metadataStatus: "mint_only",
        createdAt: partialAt,
        importedAt: partialAt,
      },
    });

    return {
      partialMint,
      mintOnlyMint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("pendingShapeGeckoterminal boundary", async (t) => {
  await t.test("returns a pending-shape summary with stable top-level counts", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedPendingShape(databaseUrl);

      const result = await runPendingShapeGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "10",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as PendingShapeGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.sinceHours, 24);
      assert.equal(parsed.selection.limit, 10);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.metadataStatus, null);
      assert.equal(parsed.selection.minReviewFlagsCount, 0);
      assert.equal(parsed.selection.staleAfterHours, 6);
      assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.selection.geckoOriginTokenCount, 3);
      assert.equal(parsed.selection.pumpFilteredTokenCount, 3);
      assert.equal(parsed.selection.excludedSmokeCount, 1);
      assert.equal(parsed.selection.eligiblePendingCount, 2);
      assert.equal(parsed.selection.filteredPendingCount, 2);
      assert.equal(parsed.selection.selectedPendingCount, 2);

      assert.deepEqual(parsed.summary.metadataStatusCounts, {
        partial: 1,
        mint_only: 1,
      });
      assert.deepEqual(parsed.summary.selectionAnchorKindCounts, {
        firstSeenDetectedAt: 2,
      });
      assert.deepEqual(parsed.summary.reviewFlagsCountDistribution, {
        "0": 1,
        "3": 1,
      });
      assert.deepEqual(parsed.summary.queuesMatchedPatternCounts, {
        "staleReview+metricPending": 1,
        "staleReview+enrichPending+metricPending": 1,
      });

      assert.equal(parsed.representativeRows.length, 2);
      assert.equal(parsed.representativeRows[0]?.mint, seeded.partialMint);
      assert.equal(parsed.representativeRows[0]?.metadataStatus, "partial");
      assert.equal(parsed.representativeRows[0]?.selectionAnchorKind, "firstSeenDetectedAt");
      assert.equal(parsed.representativeRows[0]?.reviewFlagsCount, 3);
      assert.deepEqual(parsed.representativeRows[0]?.queuesMatched, [
        "staleReview",
        "metricPending",
      ]);
      assert.equal(parsed.representativeRows[1]?.mint, seeded.mintOnlyMint);
      assert.equal(parsed.representativeRows[1]?.metadataStatus, "mint_only");
      assert.equal(parsed.representativeRows[1]?.reviewFlagsCount, 0);
      assert.deepEqual(parsed.representativeRows[1]?.queuesMatched, [
        "staleReview",
        "enrichPending",
        "metricPending",
      ]);
      assert.equal(parsed.representativeRows.every((item) => item.pendingAgeMinutes >= 6 * 60), true);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runPendingShapeGeckoterminal(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm review:pending-shape:geckoterminal -- \[--sinceHours <N>\] \[--limit <N>\] \[--pumpOnly\] \[--metadataStatus <STATUS>\] \[--minReviewFlagsCount <N>\]/,
    );
  });

  await t.test("returns an empty result when no gecko-origin pending token matches", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runPendingShapeGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "10",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as PendingShapeGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.geckoOriginTokenCount, 0);
      assert.equal(parsed.selection.pumpFilteredTokenCount, 0);
      assert.equal(parsed.selection.excludedSmokeCount, 0);
      assert.equal(parsed.selection.eligiblePendingCount, 0);
      assert.equal(parsed.selection.filteredPendingCount, 0);
      assert.equal(parsed.selection.selectedPendingCount, 0);
      assert.deepEqual(parsed.summary.metadataStatusCounts, {});
      assert.deepEqual(parsed.summary.selectionAnchorKindCounts, {});
      assert.deepEqual(parsed.summary.reviewFlagsCountDistribution, {});
      assert.deepEqual(parsed.summary.queuesMatchedPatternCounts, {});
      assert.deepEqual(parsed.representativeRows, []);
    });
  });
});
