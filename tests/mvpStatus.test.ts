import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

type MvpStatusOutput = {
  status: string;
  mode: string;
  readOnly: boolean;
  willWrite: boolean;
  willFetch: boolean;
  willSendTelegram: boolean;
  database: {
    tokenCount: number;
    metricCount: number;
    notificationCount: number;
    holderSnapshotCount: number;
  };
  migrations: {
    status: string;
    warnings: string[];
  };
  commandAvailability: Record<string, boolean>;
  readiness: Record<string, boolean>;
  blockers: string[];
  nearTermGoal: string;
  nextRecommendedSlice: string;
};

type Counts = {
  token: number;
  metric: number;
  notification: number;
  holderSnapshot: number;
};

const FORBIDDEN_OUTPUT_TERMS = [
  "buySignal",
  "shouldBuy",
  "positionSize",
  "exit",
  "tradingRecommendation",
];

async function withTempDb<T>(
  fn: (ctx: { databaseUrl: string; client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-mvp-status-"));
  const databaseUrl = `file:${join(dir, "mvp-status.db")}`;

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

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await fn({ databaseUrl, client });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

async function countRows(client: PrismaClient): Promise<Counts> {
  return {
    token: await client.token.count(),
    metric: await client.metric.count(),
    notification: await client.notification.count(),
    holderSnapshot: await client.holderSnapshot.count(),
  };
}

async function seedMvpStatusRows(client: PrismaClient): Promise<void> {
  const token = await client.token.create({
    data: {
      mint: "MvpStatus111111111111111111111111111111111111",
      name: "MVP Status Token",
      symbol: "MVPS",
      source: "test-mvp-status",
      scoreRank: "B",
      scoreTotal: 15,
    },
  });

  const metric = await client.metric.create({
    data: {
      tokenId: token.id,
      source: "test-mvp-status-metric",
      peakFdv24h: 180000,
    },
  });

  await client.notification.create({
    data: {
      notificationKey: `${token.mint}:metric_appended:${metric.id}`,
      eventType: "metric_appended",
      mint: token.mint,
      tokenId: token.id,
      metricId: metric.id,
      trigger: "metric_appended",
      status: "captured",
      mode: "capture_only",
      messagePreview: "safe mvp status preview",
      capturedAt: new Date("2026-05-16T00:00:00.000Z"),
      rawJsonFree: true,
      secretFree: true,
      source: "test-mvp-status",
    },
  });

  await client.holderSnapshot.create({
    data: {
      tokenId: token.id,
      source: "manual_holder_review",
      observedAt: new Date("2026-05-16T00:00:00.000Z"),
      topHolderPct: null,
      top10HolderPct: null,
      holderCount: null,
      freshWalletCount: null,
      bundlerSignal: "unknown",
      sameFundingOriginSignal: "unknown",
      lpWalletExcluded: null,
      confidence: "low",
      rawFree: true,
      secretFree: true,
    },
  });
}

async function runMvpStatus(databaseUrl: string): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-mvp-status-cli-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          'node --import tsx src/cli/mvpStatus.ts >"$STDOUT_FILE" 2>"$STDERR_FILE"',
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            STDOUT_FILE: stdoutPath,
            STDERR_FILE: stderrPath,
          },
        },
      );

      return {
        ok: true,
        stdout: (await readFile(stdoutPath, "utf-8")).trim(),
        stderr: (await readFile(stderrPath, "utf-8")).trim(),
      };
    } catch (error) {
      const output = error as {
        code?: number | null;
      };

      return {
        ok: false,
        stdout: (await readFile(stdoutPath, "utf-8").catch(() => "")).trim(),
        stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
        code: output.code ?? null,
      };
    }
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

function assertNoForbiddenOutputTerms(output: unknown): void {
  const serialized = JSON.stringify(output);
  for (const term of FORBIDDEN_OUTPUT_TERMS) {
    assert.doesNotMatch(serialized, new RegExp(term, "i"));
  }
}

test("mvp status boundary", async (t) => {
  await t.test("prints read-only readiness without changing DB rows", async () => {
    await withTempDb(async ({ databaseUrl, client }) => {
      await seedMvpStatusRows(client);
      const before = await countRows(client);

      const result = await runMvpStatus(databaseUrl);

      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const output = JSON.parse(result.stdout) as MvpStatusOutput;
      assert.equal(output.status, "ok");
      assert.equal(output.mode, "read_only_mvp_status");
      assert.equal(output.readOnly, true);
      assert.equal(output.willWrite, false);
      assert.equal(output.willFetch, false);
      assert.equal(output.willSendTelegram, false);
      assert.deepEqual(output.database, {
        tokenCount: 1,
        metricCount: 1,
        notificationCount: 1,
        holderSnapshotCount: 1,
      });
      assert.equal(output.nearTermGoal, "3_to_6_hour_bounded_monitoring_mvp");
      assert.equal(output.nextRecommendedSlice, "bounded_watch_readiness_check");
      assert.equal(output.blockers.includes("Pro API parked"), true);
      assert.equal(output.blockers.includes("paid holder source parked"), true);
      assert.equal(output.commandAvailability["token:observation"], true);
      assert.equal(output.commandAvailability["holder:gaps:plan"], true);
      assert.equal(output.commandAvailability["detect:geckoterminal:new-pools"], true);
      assert.equal(output.readiness.schedulerReady, false);
      assert.equal(output.readiness.systemdReady, false);
      assertNoForbiddenOutputTerms(output);

      const after = await countRows(client);
      assert.deepEqual(after, before);
    });
  });
});
