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

type MetricAddOutput = {
  id: number;
  mint: string;
  source: string | null;
  observedAt: string;
  launchPrice: number | null;
  peakPrice15m: number | null;
  peakPrice1h: number | null;
  maxMultiple15m: number | null;
  maxMultiple1h: number | null;
  peakFdv24h: number | null;
  volume24h: number | null;
  timeToPeakMinutes: number | null;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metric-add-test-"));

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

async function runMetricAdd(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `metric-add-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `metric-add-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricAdd.ts",
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

async function seedToken(databaseUrl: string, mint: string): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await db.token.create({
      data: {
        mint,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function readMetrics(
  databaseUrl: string,
  mint: string,
): Promise<
  Array<{
    id: number;
    source: string | null;
    maxMultiple15m: number | null;
    peakFdv24h: number | null;
    volume24h: number | null;
    timeToPeakMinutes: number | null;
  }>
> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.metric.findMany({
      where: {
        token: {
          mint,
        },
      },
      select: {
        id: true,
        source: true,
        maxMultiple15m: true,
        peakFdv24h: true,
        volume24h: true,
        timeToPeakMinutes: true,
      },
      orderBy: {
        id: "asc",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("metricAdd boundary", async (t) => {
  await t.test("adds a metric row with the actual required input", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);

      const result = await runMetricAdd(
        [
          "--mint",
          mint,
          "--source",
          "test-metric-add",
          "--peakFdv24h",
          "180000",
          "--volume24h",
          "42000",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricAddOutput;
      assert.equal(typeof parsed.id, "number");
      assert.equal(parsed.mint, mint);
      assert.equal(parsed.source, "test-metric-add");
      assert.match(parsed.observedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.peakFdv24h, 180000);
      assert.equal(parsed.volume24h, 42000);
      assert.equal(parsed.maxMultiple15m, null);
      assert.equal(parsed.timeToPeakMinutes, null);

      const metrics = await readMetrics(databaseUrl, mint);
      assert.deepEqual(metrics, [
        {
          id: parsed.id,
          source: "test-metric-add",
          maxMultiple15m: null,
          peakFdv24h: 180000,
          volume24h: 42000,
          timeToPeakMinutes: null,
        },
      ]);
    });
  });

  await t.test("exits non-zero when mint is missing", async () => {
    const result = await runMetricAdd([
      "--peakFdv24h",
      "180000",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm metric:add -- --mint <MINT> \[--source <SOURCE>\]/,
    );
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runMetricAdd([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--peakFdv24h",
      "180000",
      "--desc",
      "should-fail",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --desc/);
    assert.match(
      result.stdout,
      /pnpm metric:add -- --mint <MINT> \[--source <SOURCE>\]/,
    );
  });

  await t.test("appends an additional metric row on sequential runs for the same token", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "rerun.db")}`;
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);

      const first = await runMetricAdd(
        [
          "--mint",
          mint,
          "--source",
          "test-metric-add-rerun",
          "--maxMultiple15m",
          "1.8",
        ],
        databaseUrl,
      );
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as MetricAddOutput;

      const second = await runMetricAdd(
        [
          "--mint",
          mint,
          "--peakFdv24h",
          "123000",
          "--timeToPeakMinutes",
          "12",
        ],
        databaseUrl,
      );
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as MetricAddOutput;

      assert.equal(firstParsed.mint, mint);
      assert.equal(firstParsed.source, "test-metric-add-rerun");
      assert.equal(firstParsed.maxMultiple15m, 1.8);
      assert.equal(secondParsed.mint, mint);
      assert.equal(secondParsed.source, "manual");
      assert.equal(secondParsed.peakFdv24h, 123000);
      assert.equal(secondParsed.timeToPeakMinutes, 12);
      assert.notEqual(secondParsed.id, firstParsed.id);

      const metrics = await readMetrics(databaseUrl, mint);
      assert.deepEqual(metrics, [
        {
          id: firstParsed.id,
          source: "test-metric-add-rerun",
          maxMultiple15m: 1.8,
          peakFdv24h: null,
          volume24h: null,
          timeToPeakMinutes: null,
        },
        {
          id: secondParsed.id,
          source: "manual",
          maxMultiple15m: null,
          peakFdv24h: 123000,
          volume24h: null,
          timeToPeakMinutes: 12,
        },
      ]);
    });
  });
});
