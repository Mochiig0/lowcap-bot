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

type TokensReportOutput = {
  count: number;
  filters: {
    rank: string | null;
    source: string | null;
    hasMetrics: boolean | null;
    hardRejected: boolean | null;
    metadataStatus: string | null;
    createdAfter: string | null;
    limit: number;
  };
  items: Array<{
    mint: string;
    name: string | null;
    symbol: string | null;
    scoreRank: string;
    scoreTotal: number;
    hardRejected: boolean;
    hardRejectReason: string | null;
    metadataStatus: string;
    source: string | null;
    metricsCount: number;
    latestMetricObservedAt: string | null;
    createdAt: string;
    updatedAt: string;
    enrichedAt: string | null;
    rescoredAt: string | null;
    devWallet: string | null;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-tokens-report-test-"));

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

async function runTokensReport(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `tokens-report-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `tokens-report-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokensReport.ts",
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

async function seedTokens(databaseUrl: string): Promise<{
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
    const dev = await db.dev.create({
      data: {
        wallet: "DevWallet555555555555555555555555555555555",
      },
      select: {
        id: true,
      },
    });

    const firstToken = await db.token.create({
      data: {
        mint: "So11111111111111111111111111111111111111112",
        name: "Tokens Report Token",
        symbol: "TREP",
        source: "test-tokens-report",
        metadataStatus: "mint_only",
        scoreRank: "B",
        scoreTotal: 15,
        devId: dev.id,
      },
      select: {
        id: true,
        mint: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: firstToken.id,
        source: "test-tokens-report-metric",
        peakFdv24h: 180000,
      },
    });

    await db.token.create({
      data: {
        mint: "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW",
        name: "Tokens Other Token",
        symbol: "TREP2",
        source: "other-source",
        metadataStatus: "partial",
        scoreRank: "C",
        scoreTotal: 0,
      },
    });

    return {
      targetMint: firstToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("tokensReport boundary", async (t) => {
  await t.test("returns a filtered token report with stable top-level fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedTokens(databaseUrl);

      const result = await runTokensReport(
        [
          "--source",
          "test-tokens-report",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokensReportOutput;
      assert.equal(parsed.count, 1);
      assert.deepEqual(parsed.filters, {
        rank: null,
        source: "test-tokens-report",
        hasMetrics: null,
        hardRejected: null,
        metadataStatus: null,
        createdAfter: null,
        limit: 5,
      });
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.mint, seeded.targetMint);
      assert.equal(parsed.items[0]?.name, "Tokens Report Token");
      assert.equal(parsed.items[0]?.symbol, "TREP");
      assert.equal(parsed.items[0]?.scoreRank, "B");
      assert.equal(parsed.items[0]?.scoreTotal, 15);
      assert.equal(parsed.items[0]?.metadataStatus, "mint_only");
      assert.equal(parsed.items[0]?.source, "test-tokens-report");
      assert.equal(parsed.items[0]?.metricsCount, 1);
      assert.equal(
        typeof parsed.items[0]?.latestMetricObservedAt === "string",
        true,
      );
      assert.equal(
        parsed.items[0]?.devWallet,
        "DevWallet555555555555555555555555555555555",
      );
      assert.match(parsed.items[0]?.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.match(parsed.items[0]?.updatedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runTokensReport([
      "--mint",
      "So11111111111111111111111111111111111111112",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(result.stdout, /pnpm tokens:report --/);
  });

  await t.test("returns an empty result when no tokens match the filters", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);
      await seedTokens(databaseUrl);

      const result = await runTokensReport(
        [
          "--source",
          "missing-source",
          "--limit",
          "3",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokensReportOutput;
      assert.equal(parsed.count, 0);
      assert.deepEqual(parsed.filters, {
        rank: null,
        source: "missing-source",
        hasMetrics: null,
        hardRejected: null,
        metadataStatus: null,
        createdAfter: null,
        limit: 3,
      });
      assert.deepEqual(parsed.items, []);
    });
  });
});
