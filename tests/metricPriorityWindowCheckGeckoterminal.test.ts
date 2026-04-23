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

type WindowSummary = {
  sinceMinutes: number;
  eligibleCount: number;
  smokeCount: number;
  top5SmokeCount: number;
  top10SmokeCount: number;
  top20SmokeCount: number;
  firstNonMintOnlyRank: number | null;
  firstReviewFlagsJsonRank: number | null;
  firstReviewFlagsCountRank: number | null;
  cleanCandidate: boolean;
  topLimitSmokeCounts: Record<string, number>;
  representativeTopMints: string[];
};

type MetricPriorityWindowCheckOutput = {
  readOnly: boolean;
  originSource: string;
  selection: {
    sinceMinutesList: number[];
    topLimits: number[];
    pumpOnly: boolean;
  };
  windows: WindowSummary[];
  cleanCandidates: Array<{
    sinceMinutes: number;
    eligibleCount: number;
    smokeCount: number;
    top5SmokeCount: number;
    top10SmokeCount: number;
    top20SmokeCount: number;
    firstNonMintOnlyRank: number | null;
    firstReviewFlagsJsonRank: number | null;
    firstReviewFlagsCountRank: number | null;
    cleanCandidate: boolean;
    topLimitSmokeCounts: Record<string, number>;
    representativeTopMints: string[];
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-priority-window-test-"));

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

async function runMetricPriorityWindowCheckGeckoterminal(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-priority-window-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-priority-window-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricPriorityWindowCheckGeckoterminal.ts",
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

async function seedPriorityWindowCheck(databaseUrl: string): Promise<{
  cleanFlaggedMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const baseTimestamp = Date.now();
    const cleanFlaggedMint = "clean-gecko-window-flagged";
    const cleanPartialMint = "clean-gecko-window-partial";
    const cleanMintOnlyMint = "clean-gecko-window-mint-only";
    const smokeMints = [
      "SMOKE_GECKO_WINDOW_0",
      "SMOKE_GECKO_WINDOW_1",
      "SMOKE_GECKO_WINDOW_2",
    ];

    const seedTokens = [
      {
        mint: cleanFlaggedMint,
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: new Date(baseTimestamp).toISOString(),
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
      {
        mint: cleanPartialMint,
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: new Date(baseTimestamp - 10_000).toISOString(),
          },
        },
      },
      {
        mint: cleanMintOnlyMint,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: new Date(baseTimestamp - 20_000).toISOString(),
          },
        },
      },
      ...smokeMints.map((mint, index) => ({
        mint,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: new Date(
              baseTimestamp - (150 * 60_000 + index * 1_000),
            ).toISOString(),
          },
        },
      })),
      {
        mint: "manual-non-gecko-window",
        source: "manual",
        metadataStatus: "partial",
      },
    ];

    for (const token of seedTokens) {
      await db.token.create({ data: token });
    }

    return { cleanFlaggedMint };
  } finally {
    await db.$disconnect();
  }
}

test("metricPriorityWindowCheckGeckoterminal boundary", async (t) => {
  await t.test("returns stable clean-window and mixed-window summaries", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedPriorityWindowCheck(databaseUrl);

      const result = await runMetricPriorityWindowCheckGeckoterminal(
        [
          "--sinceMinutesList",
          "60,180",
          "--topLimits",
          "5,10,20",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricPriorityWindowCheckOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.deepEqual(parsed.selection.sinceMinutesList, [60, 180]);
      assert.deepEqual(parsed.selection.topLimits, [5, 10, 20]);
      assert.equal(parsed.selection.pumpOnly, false);

      const sixtyMinuteWindow = parsed.windows.find((item) => item.sinceMinutes === 60);
      const oneEightyMinuteWindow = parsed.windows.find((item) => item.sinceMinutes === 180);

      assert.ok(sixtyMinuteWindow);
      assert.ok(oneEightyMinuteWindow);

      assert.equal(sixtyMinuteWindow?.eligibleCount, 3);
      assert.equal(sixtyMinuteWindow?.smokeCount, 0);
      assert.equal(sixtyMinuteWindow?.top20SmokeCount, 0);
      assert.equal(sixtyMinuteWindow?.firstNonMintOnlyRank, 1);
      assert.equal(sixtyMinuteWindow?.firstReviewFlagsJsonRank, 1);
      assert.equal(sixtyMinuteWindow?.firstReviewFlagsCountRank, 1);
      assert.equal(sixtyMinuteWindow?.cleanCandidate, true);
      assert.deepEqual(sixtyMinuteWindow?.topLimitSmokeCounts, {
        "5": 0,
        "10": 0,
        "20": 0,
      });
      assert.equal(
        sixtyMinuteWindow?.representativeTopMints.includes(seeded.cleanFlaggedMint),
        true,
      );

      assert.equal(oneEightyMinuteWindow?.eligibleCount, 6);
      assert.equal(oneEightyMinuteWindow?.smokeCount, 3);
      assert.equal(oneEightyMinuteWindow?.top5SmokeCount, 2);
      assert.equal(oneEightyMinuteWindow?.top10SmokeCount, 3);
      assert.equal(oneEightyMinuteWindow?.top20SmokeCount, 3);
      assert.equal(oneEightyMinuteWindow?.firstNonMintOnlyRank, 1);
      assert.equal(oneEightyMinuteWindow?.firstReviewFlagsJsonRank, 1);
      assert.equal(oneEightyMinuteWindow?.firstReviewFlagsCountRank, 1);
      assert.equal(oneEightyMinuteWindow?.cleanCandidate, false);
      assert.deepEqual(oneEightyMinuteWindow?.topLimitSmokeCounts, {
        "5": 2,
        "10": 3,
        "20": 3,
      });

      assert.equal(parsed.cleanCandidates.length, 1);
      assert.equal(parsed.cleanCandidates[0]?.sinceMinutes, 60);
      assert.equal(parsed.cleanCandidates[0]?.eligibleCount, 3);
      assert.equal(parsed.cleanCandidates[0]?.top20SmokeCount, 0);
      assert.equal(parsed.cleanCandidates[0]?.cleanCandidate, true);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runMetricPriorityWindowCheckGeckoterminal(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm metric:priority-window-check:geckoterminal -- \[--sinceMinutesList "30,45,60,75,90,105,120,150,180,240,360,720,1440"\] \[--topLimits "5,10,20"\] \[--pumpOnly\]/,
    );
  });

  await t.test("returns empty windows when no gecko-origin token matches", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runMetricPriorityWindowCheckGeckoterminal(
        [
          "--sinceMinutesList",
          "60,180",
          "--topLimits",
          "5,10,20",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricPriorityWindowCheckOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.deepEqual(parsed.selection.sinceMinutesList, [60, 180]);
      assert.deepEqual(parsed.selection.topLimits, [5, 10, 20]);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.windows.length, 2);
      assert.deepEqual(
        parsed.windows.map((item) => ({
          sinceMinutes: item.sinceMinutes,
          eligibleCount: item.eligibleCount,
          smokeCount: item.smokeCount,
          cleanCandidate: item.cleanCandidate,
          representativeTopMints: item.representativeTopMints,
        })),
        [
          {
            sinceMinutes: 60,
            eligibleCount: 0,
            smokeCount: 0,
            cleanCandidate: false,
            representativeTopMints: [],
          },
          {
            sinceMinutes: 180,
            eligibleCount: 0,
            smokeCount: 0,
            cleanCandidate: false,
            representativeTopMints: [],
          },
        ],
      );
      assert.deepEqual(
        parsed.windows.map((item) => item.topLimitSmokeCounts),
        [
          { "5": 0, "10": 0, "20": 0 },
          { "5": 0, "10": 0, "20": 0 },
        ],
      );
      assert.deepEqual(parsed.cleanCandidates, []);
    });
  });
});
