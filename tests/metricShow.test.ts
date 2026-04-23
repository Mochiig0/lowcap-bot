import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";

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

type MetricShowOutput = {
  id: number;
  tokenId: number;
  token: {
    mint: string;
    name: string | null;
    symbol: string | null;
  };
  source: string | null;
  observedAt: string;
  maxMultiple15m: number | null;
  peakFdv24h: number | null;
  volume24h: number | null;
  peakFdv7d: number | null;
  volume7d: number | null;
  rawJson: Prisma.JsonValue;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metric-show-test-"));

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

async function runMetricShow(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `metric-show-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `metric-show-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricShow.ts",
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

async function seedMetric(
  databaseUrl: string,
  mint: string,
): Promise<{
  metricId: number;
  tokenId: number;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const token = await db.token.create({
      data: {
        mint,
        name: "Metric Show Token",
        symbol: "MSHOW",
      },
      select: {
        id: true,
      },
    });

    const metric = await db.metric.create({
      data: {
        tokenId: token.id,
        source: "test-metric-show",
        peakFdv24h: 180000,
        volume24h: 42000,
        rawJson: {
          provider: "test",
          sample: true,
        },
      },
      select: {
        id: true,
      },
    });

    return {
      metricId: metric.id,
      tokenId: token.id,
    };
  } finally {
    await db.$disconnect();
  }
}

test("metricShow boundary", async (t) => {
  await t.test("shows one metric row with the actual output shape", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      const seeded = await seedMetric(databaseUrl, mint);

      const result = await runMetricShow(
        ["--id", String(seeded.metricId)],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricShowOutput;
      assert.equal(parsed.id, seeded.metricId);
      assert.equal(parsed.tokenId, seeded.tokenId);
      assert.deepEqual(parsed.token, {
        mint,
        name: "Metric Show Token",
        symbol: "MSHOW",
      });
      assert.equal(parsed.source, "test-metric-show");
      assert.match(parsed.observedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.peakFdv24h, 180000);
      assert.equal(parsed.volume24h, 42000);
      assert.equal(parsed.maxMultiple15m, null);
      assert.equal(parsed.peakFdv7d, null);
      assert.equal(parsed.volume7d, null);
      assert.deepEqual(parsed.rawJson, {
        provider: "test",
        sample: true,
      });
    });
  });

  await t.test("exits non-zero when id is missing", async () => {
    const result = await runMetricShow([]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --id/);
    assert.match(result.stdout, /pnpm metric:show -- --id <ID>/);
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runMetricShow([
      "--id",
      "1",
      "--mint",
      "should-fail",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(result.stdout, /pnpm metric:show -- --id <ID>/);
  });

  await t.test("exits non-zero when the metric id does not exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing.db")}`;

      await runDbPush(databaseUrl);

      const result = await runMetricShow(["--id", "999"], databaseUrl);
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Metric not found for id: 999/);
      assert.match(result.stdout, /pnpm metric:show -- --id <ID>/);
    });
  });
});
