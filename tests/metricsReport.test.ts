import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

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

type MetricsReportOutput = {
  count: number;
  filters: {
    mint: string | null;
    tokenId: number | null;
    source: string | null;
    rank: string | null;
    hasPeakFdv24h: boolean | null;
    hasPeakFdv7d: boolean | null;
    hasMaxMultiple15m: boolean | null;
    hasTimeToPeakMinutes: boolean | null;
    hasVolume24h: boolean | null;
    hasVolume7d: boolean | null;
    hasPeakPrice15m: boolean | null;
    sortBy: string | null;
    sortOrder: "asc" | "desc";
    limit: number;
  };
  items: Array<{
    id: number;
    token: {
      mint: string;
      name: string | null;
      symbol: string | null;
      scoreRank: string;
      scoreTotal: number;
    };
    source: string | null;
    observedAt: string;
    peakPrice15m: number | null;
    maxMultiple15m: number | null;
    peakFdv24h: number | null;
    volume24h: number | null;
    peakFdv7d: number | null;
    volume7d: number | null;
    timeToPeakMinutes: number | null;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metrics-report-test-"));

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

async function runMetricsReport(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `metrics-report-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `metrics-report-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricsReport.ts",
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

async function seedMetrics(databaseUrl: string): Promise<{
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
    const firstToken = await db.token.create({
      data: {
        mint: "So11111111111111111111111111111111111111112",
        name: "Metrics Report Token",
        symbol: "MREP",
      },
      select: {
        id: true,
        mint: true,
      },
    });

    const secondToken = await db.token.create({
      data: {
        mint: "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW",
        name: "Metrics Other Token",
        symbol: "MREP2",
      },
      select: {
        id: true,
      },
    });

    await db.metric.createMany({
      data: [
        {
          tokenId: firstToken.id,
          source: "test-metrics-report",
          peakFdv24h: 180000,
          volume24h: 42000,
        },
        {
          tokenId: secondToken.id,
          source: "other-source",
          maxMultiple15m: 1.8,
        },
      ],
    });

    return {
      targetMint: firstToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("metricsReport boundary", async (t) => {
  await t.test("returns a filtered metrics report with the actual output shape", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedMetrics(databaseUrl);

      const result = await runMetricsReport(
        [
          "--mint",
          seeded.targetMint,
          "--source",
          "test-metrics-report",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricsReportOutput;
      assert.equal(parsed.count, 1);
      assert.deepEqual(parsed.filters, {
        mint: seeded.targetMint,
        tokenId: null,
        source: "test-metrics-report",
        rank: null,
        hasPeakFdv24h: null,
        hasPeakFdv7d: null,
        hasMaxMultiple15m: null,
        hasTimeToPeakMinutes: null,
        hasVolume24h: null,
        hasVolume7d: null,
        hasPeakPrice15m: null,
        sortBy: null,
        sortOrder: "desc",
        limit: 5,
      });
      assert.equal(parsed.items.length, 1);
      assert.equal(typeof parsed.items[0]?.id, "number");
      assert.deepEqual(parsed.items[0]?.token, {
        mint: seeded.targetMint,
        name: "Metrics Report Token",
        symbol: "MREP",
        scoreRank: "C",
        scoreTotal: 0,
      });
      assert.equal(parsed.items[0]?.source, "test-metrics-report");
      assert.match(parsed.items[0]?.observedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.items[0]?.peakFdv24h, 180000);
      assert.equal(parsed.items[0]?.volume24h, 42000);
      assert.equal(parsed.items[0]?.maxMultiple15m, null);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runMetricsReport([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--id",
      "1",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --id/);
    assert.match(result.stdout, /pnpm metrics:report --/);
  });

  await t.test("returns an empty result when no metric rows match the filters", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);
      await seedMetrics(databaseUrl);

      const result = await runMetricsReport(
        [
          "--source",
          "missing-source",
          "--limit",
          "3",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricsReportOutput;
      assert.equal(parsed.count, 0);
      assert.deepEqual(parsed.filters, {
        mint: null,
        tokenId: null,
        source: "missing-source",
        rank: null,
        hasPeakFdv24h: null,
        hasPeakFdv7d: null,
        hasMaxMultiple15m: null,
        hasTimeToPeakMinutes: null,
        hasVolume24h: null,
        hasVolume7d: null,
        hasPeakPrice15m: null,
        sortBy: null,
        sortOrder: "desc",
        limit: 3,
      });
      assert.deepEqual(parsed.items, []);
    });
  });
});
