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

type BoundedWatchReadinessOutput = {
  status: string;
  mode: string;
  readOnly: boolean;
  willWrite: boolean;
  willFetch: boolean;
  willSendTelegram: boolean;
  willUpdateCheckpoint: boolean;
  nearTermGoal: string;
  nextRecommendedSlice: string;
  database: {
    tokenCount: number;
    metricCount: number;
    notificationCount: number;
  };
  commandAvailability: Record<string, boolean>;
  support: {
    checkpoint: {
      available: boolean;
      activeOnlyWithWatchAndWrite: boolean;
      readOnlyCliWillUpdateCheckpoint: boolean;
    };
    dedupe: {
      tokenMintUnique: boolean;
      existingTokenSkipPath: boolean;
    };
  };
  readiness: Record<string, boolean>;
  blockers: string[];
  warnings: string[];
  nextCommands: {
    threeHourDryRun: string | null;
    threeHourWriteRehearsal: string | null;
    sixHourMonitoredRun: string | null;
    reason: string;
  };
};

type Counts = {
  token: number;
  metric: number;
  notification: number;
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
  const dir = await mkdtemp(join(tmpdir(), "lowcap-bounded-watch-readiness-"));
  const databaseUrl = `file:${join(dir, "bounded-watch-readiness.db")}`;

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
  };
}

async function seedBoundedWatchRows(client: PrismaClient): Promise<void> {
  const token = await client.token.create({
    data: {
      mint: "BoundedWatch111111111111111111111111111111111",
      name: "Bounded Watch Token",
      symbol: "BWT",
      source: "test-bounded-watch",
      scoreRank: "B",
      scoreTotal: 15,
    },
  });

  const metric = await client.metric.create({
    data: {
      tokenId: token.id,
      source: "test-bounded-watch-metric",
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
      messagePreview: "safe bounded watch readiness preview",
      capturedAt: new Date("2026-05-16T00:00:00.000Z"),
      rawJsonFree: true,
      secretFree: true,
      source: "test-bounded-watch",
    },
  });
}

async function runBoundedWatchReadiness(databaseUrl: string): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-bounded-watch-cli-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          'node --import tsx src/cli/boundedWatchReadiness.ts >"$STDOUT_FILE" 2>"$STDERR_FILE"',
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

test("bounded watch readiness boundary", async (t) => {
  await t.test("prints read-only readiness without changing DB rows", async () => {
    await withTempDb(async ({ databaseUrl, client }) => {
      await seedBoundedWatchRows(client);
      const before = await countRows(client);

      const result = await runBoundedWatchReadiness(databaseUrl);

      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const output = JSON.parse(result.stdout) as BoundedWatchReadinessOutput;
      assert.equal(output.status, "ok");
      assert.equal(output.mode, "read_only_bounded_watch_readiness");
      assert.equal(output.readOnly, true);
      assert.equal(output.willWrite, false);
      assert.equal(output.willFetch, false);
      assert.equal(output.willSendTelegram, false);
      assert.equal(output.willUpdateCheckpoint, false);
      assert.deepEqual(output.database, {
        tokenCount: 1,
        metricCount: 1,
        notificationCount: 1,
      });
      assert.equal(output.nearTermGoal, "3_to_6_hour_bounded_monitoring_mvp");
      assert.equal(output.nextRecommendedSlice, "three_hour_dry_run");
      assert.equal(output.blockers.includes("Pro API parked"), true);
      assert.equal(output.blockers.includes("paid holder source parked"), true);
      assert.equal(output.commandAvailability["detect:geckoterminal:new-pools"], true);
      assert.equal(output.commandAvailability["detect:dexscreener:token-profiles"], true);
      assert.equal(output.support.checkpoint.available, true);
      assert.equal(output.support.checkpoint.activeOnlyWithWatchAndWrite, true);
      assert.equal(output.support.checkpoint.readOnlyCliWillUpdateCheckpoint, false);
      assert.equal(output.support.dedupe.tokenMintUnique, true);
      assert.equal(output.support.dedupe.existingTokenSkipPath, true);
      assert.equal(output.readiness.sourceDetectionAvailable, true);
      assert.equal(output.readiness.metricAccumulationAvailable, true);
      assert.equal(output.readiness.observationReviewAvailable, true);
      assert.equal(output.readiness.threeHourRunReady, false);
      assert.equal(output.readiness.sixHourRunReady, false);
      assert.equal(output.readiness.schedulerReady, false);
      assert.equal(output.readiness.systemdReady, false);
      assert.match(output.nextCommands.threeHourDryRun ?? "", /detect:geckoterminal:new-pools/);
      assert.match(output.nextCommands.threeHourDryRun ?? "", /--maxIterations 180/);
      assert.match(output.nextCommands.threeHourWriteRehearsal ?? "", /--checkpointFile \/tmp\//);
      assert.equal(output.nextCommands.sixHourMonitoredRun, null);
      assertNoForbiddenOutputTerms(output);

      const after = await countRows(client);
      assert.deepEqual(after, before);
    });
  });
});
