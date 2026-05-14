import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  addHolderSnapshot,
  type HolderSnapshotAddOutput,
} from "../src/cli/holderSnapshotAdd.ts";
import {
  showHolderSnapshots,
  type HolderSnapshotShowOutput,
} from "../src/cli/holderSnapshotShow.ts";
import type { HolderDistributionSafeSummary } from "../src/observation/holderDistributionSafeSummary.ts";

const execFileAsync = promisify(execFile);

type Counts = {
  token: number;
  metric: number;
  notification: number;
  holderSnapshot: number;
};

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

const FORBIDDEN_OUTPUT_TERMS = [
  "buySignal",
  "shouldBuy",
  "positionSize",
  "exit",
  "buyRecommendation",
  "tradingRecommendation",
  "financialAdvice",
];

function validSummary(
  overrides: Partial<HolderDistributionSafeSummary> = {},
): HolderDistributionSafeSummary {
  return {
    topHolderPct: 12.5,
    top10HolderPct: 42.25,
    holderCount: 1234,
    freshWalletCount: 17,
    bundlerSignal: "low",
    sameFundingOriginSignal: "unknown",
    lpWalletExcluded: true,
    source: "rugcheck.safe_summary",
    observedAt: "2026-05-10T00:00:00.000Z",
    confidence: "medium",
    rawFree: true,
    secretFree: true,
    ...overrides,
  };
}

function assertNoForbiddenOutputTerms(output: unknown): void {
  const serialized = JSON.stringify(output);
  for (const term of FORBIDDEN_OUTPUT_TERMS) {
    assert.doesNotMatch(serialized, new RegExp(term, "i"));
  }
}

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient; databaseUrl: string; dir: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-holder-snapshot-"));
  const databaseUrl = `file:${join(dir, "holder-snapshot.db")}`;
  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    assert.ok(databaseUrl.includes("lowcap-holder-snapshot-"));
    await createMinimalSchema(client);
    return await fn({ client, databaseUrl, dir });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

async function createMinimalSchema(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(`
    CREATE TABLE "Token" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "mint" TEXT NOT NULL UNIQUE,
      "name" TEXT,
      "symbol" TEXT,
      "description" TEXT,
      "source" TEXT,
      "groupKey" TEXT,
      "groupNote" TEXT,
      "normalizedText" TEXT,
      "hardRejected" BOOLEAN NOT NULL DEFAULT false,
      "hardRejectReason" TEXT,
      "scoreTotal" INTEGER NOT NULL DEFAULT 0,
      "scoreRank" TEXT NOT NULL DEFAULT 'C',
      "scoreBreakdown" JSONB,
      "reviewFlagsJson" JSONB,
      "entrySnapshot" JSONB,
      "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "enrichedAt" DATETIME,
      "rescoredAt" DATETIME,
      "metadataStatus" TEXT NOT NULL DEFAULT 'mint_only',
      "devId" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE "Metric" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tokenId" INTEGER NOT NULL,
      "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "source" TEXT
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE "Notification" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE "HolderSnapshot" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tokenId" INTEGER NOT NULL,
      "source" TEXT NOT NULL,
      "observedAt" DATETIME NOT NULL,
      "topHolderPct" REAL,
      "top10HolderPct" REAL,
      "holderCount" INTEGER,
      "freshWalletCount" INTEGER,
      "bundlerSignal" TEXT NOT NULL,
      "sameFundingOriginSignal" TEXT NOT NULL,
      "lpWalletExcluded" BOOLEAN,
      "confidence" TEXT NOT NULL,
      "rawFree" BOOLEAN NOT NULL,
      "secretFree" BOOLEAN NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "HolderSnapshot_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await client.$executeRawUnsafe(
    `CREATE INDEX "HolderSnapshot_tokenId_observedAt_idx" ON "HolderSnapshot"("tokenId", "observedAt")`,
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX "HolderSnapshot_source_observedAt_idx" ON "HolderSnapshot"("source", "observedAt")`,
  );
}

async function seedToken(client: PrismaClient, mint: string): Promise<void> {
  await client.token.create({
    data: {
      mint,
      name: "Holder Snapshot Test",
      symbol: "HST",
      source: "test-holder-snapshot",
    },
  });
}

async function counts(client: PrismaClient): Promise<Counts> {
  return {
    token: await client.token.count(),
    metric: await client.metric.count(),
    notification: await client.notification.count(),
    holderSnapshot: await client.holderSnapshot.count(),
  };
}

async function writeJsonFixture(dir: string, name: string, input: unknown): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(input, null, 2), "utf-8");
  return path;
}

async function runHolderSnapshotAddCli(
  args: string[],
  databaseUrl: string,
): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-holder-snapshot-cli-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          [
            "node --import tsx src/cli/holderSnapshotAdd.ts",
            ...args.map((_, index) => `\"$ARG_${index}\"`),
            ">\"$STDOUT_FILE\"",
            "2>\"$STDERR_FILE\"",
          ].join(" "),
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            STDOUT_FILE: stdoutPath,
            STDERR_FILE: stderrPath,
            ...Object.fromEntries(args.map((arg, index) => [`ARG_${index}`, arg])),
          },
        },
      );

      return {
        ok: true,
        stdout: (await readFile(stdoutPath, "utf-8")).trim(),
        stderr: (await readFile(stderrPath, "utf-8")).trim(),
      };
    } catch (error) {
      return {
        ok: false,
        stdout: (await readFile(stdoutPath, "utf-8").catch(() => "")).trim(),
        stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
        code: (error as { code?: number | null }).code ?? null,
      };
    }
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

function parseAddOutput(stdout: string): HolderSnapshotAddOutput {
  return JSON.parse(stdout) as HolderSnapshotAddOutput;
}

test("holder snapshot add writes exactly one row for an existing Token", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "HolderSnapshotAddExisting111111111pump";
    await seedToken(client, mint);

    const before = await counts(client);
    const output = await addHolderSnapshot(client, {
      mint,
      fileInput: validSummary(),
    });
    const after = await counts(client);

    assert.equal(output.status, "ok");
    assert.equal(output.updated, true);
    assert.equal(typeof output.holderSnapshotId, "number");
    assert.equal(output.source, "rugcheck.safe_summary");
    assert.equal(output.rawFree, true);
    assert.equal(output.secretFree, true);
    assert.equal(output.safetyBoundary.writeScope, "one_holder_snapshot_row");
    assert.equal(output.safetyBoundary.tokenUpdated, false);
    assert.equal(output.safetyBoundary.metricUpdated, false);
    assert.equal(output.safetyBoundary.notificationUpdated, false);
    assert.equal(output.safetyBoundary.externalFetch, false);
    assert.equal(output.safetyBoundary.telegramSend, false);
    assert.equal(output.safetyBoundary.queue, false);
    assert.equal(output.safetyBoundary.systemd, false);
    assert.deepEqual(after, {
      token: before.token,
      metric: before.metric,
      notification: before.notification,
      holderSnapshot: before.holderSnapshot + 1,
    });
    assertNoForbiddenOutputTerms(output);
  });
});

test("holder snapshot add accepts a matching wrapper fixture", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "HolderSnapshotWrapper111111111111pump";
    await seedToken(client, mint);

    const output = await addHolderSnapshot(client, {
      mint,
      fileInput: {
        mint,
        summary: validSummary({
          source: "manual_holder_review",
          confidence: "low",
        }),
      },
    });

    assert.equal(output.status, "ok");
    assert.equal(output.mint, mint);
    assert.equal(output.source, "manual_holder_review");
    assert.equal(output.holderSnapshotId > 0, true);
    assert.equal(await client.holderSnapshot.count(), 1);
    assertNoForbiddenOutputTerms(output);
  });
});

test("holder snapshot add rejects missing Token without writing", async () => {
  await withTempDb(async ({ client }) => {
    const before = await counts(client);
    const output = await addHolderSnapshot(client, {
      mint: "HolderSnapshotMissing111111111111pump",
      fileInput: validSummary(),
    });
    const after = await counts(client);

    assert.equal(output.status, "not_found");
    assert.equal(output.updated, false);
    assert.equal(output.holderSnapshotId, null);
    assert.deepEqual(after, before);
    assertNoForbiddenOutputTerms(output);
  });
});

test("holder snapshot add rejects invalid safe summary without writing", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "HolderSnapshotInvalid111111111111pump";
    await seedToken(client, mint);
    const before = await counts(client);
    const output = await addHolderSnapshot(client, {
      mint,
      fileInput: {
        ...validSummary(),
        topHolderPct: 101,
      },
    });
    const after = await counts(client);

    assert.equal(output.status, "invalid_safe_summary");
    assert.equal(output.updated, false);
    assert.ok(output.issues.some((issue) => /topHolderPct/.test(issue)));
    assert.deepEqual(after, before);
    assertNoForbiddenOutputTerms(output);
  });
});

test("holder snapshot add rejects file mint mismatch and batch input without writing", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "HolderSnapshotMismatch1111111111pump";
    await seedToken(client, mint);

    const beforeMismatch = await counts(client);
    const mismatch = await addHolderSnapshot(client, {
      mint,
      fileInput: {
        mint: "DifferentMint111111111111111111pump",
        summary: validSummary(),
      },
    });
    const afterMismatch = await counts(client);

    assert.equal(mismatch.status, "mint_mismatch");
    assert.deepEqual(afterMismatch, beforeMismatch);

    const batch = await addHolderSnapshot(client, {
      mint,
      fileInput: {
        items: [
          {
            mint,
            summary: validSummary(),
          },
        ],
      },
    });
    const afterBatch = await counts(client);

    assert.equal(batch.status, "invalid_safe_summary");
    assert.ok(batch.issues.some((issue) => /batch|items array/.test(issue)));
    assert.deepEqual(afterBatch, beforeMismatch);
    assertNoForbiddenOutputTerms(mismatch);
    assertNoForbiddenOutputTerms(batch);
  });
});

test("holder snapshot add CLI does not echo raw wallet list or secret values", async () => {
  await withTempDb(async ({ client, databaseUrl, dir }) => {
    const mint = "HolderSnapshotNoEcho111111111111pump";
    const walletValue = "wallet-value-that-must-not-appear";
    const secretValue = "secret-value-that-must-not-appear";
    await seedToken(client, mint);
    const fixture = await writeJsonFixture(dir, "unsafe.json", {
      mint,
      summary: {
        ...validSummary(),
        walletList: [walletValue],
        apiKey: secretValue,
      },
    });

    const result = await runHolderSnapshotAddCli(
      ["--mint", mint, "--file", fixture],
      databaseUrl,
    );
    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");

    const output = parseAddOutput(result.stdout);
    assert.equal(output.status, "invalid_safe_summary");
    assert.equal(output.updated, false);
    assert.equal(await client.holderSnapshot.count(), 0);
    assert.doesNotMatch(result.stdout, new RegExp(walletValue));
    assert.doesNotMatch(result.stdout, new RegExp(secretValue));
    assert.doesNotMatch(result.stdout, /walletList/);
    assert.doesNotMatch(result.stdout, /apiKey/);
    assertNoForbiddenOutputTerms(output);
  });
});

test("holder snapshot show returns latest snapshots ordered by observedAt desc then id desc", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "HolderSnapshotShowOrder11111111111pump";
    await seedToken(client, mint);

    const first = await addHolderSnapshot(client, {
      mint,
      fileInput: validSummary({
        source: "manual_holder_review",
        observedAt: "2026-05-10T00:00:00.000Z",
      }),
    });
    const second = await addHolderSnapshot(client, {
      mint,
      fileInput: validSummary({
        source: "external_holder_report",
        observedAt: "2026-05-11T00:00:00.000Z",
      }),
    });
    const third = await addHolderSnapshot(client, {
      mint,
      fileInput: validSummary({
        source: "rugcheck.safe_summary",
        observedAt: "2026-05-11T00:00:00.000Z",
        confidence: "high",
      }),
    });
    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(third.status, "ok");

    const output = await showHolderSnapshots(client, {
      mint,
      limit: 3,
    });

    assert.equal(output.status, "ok");
    assert.equal(output.mode, "read_only_holder_snapshot_show");
    assert.equal(output.count, 3);
    assert.deepEqual(
      output.items.map((item) => item.holderSnapshotId),
      [
        third.holderSnapshotId,
        second.holderSnapshotId,
        first.holderSnapshotId,
      ],
    );
    assert.equal(output.items[0]?.source, "rugcheck.safe_summary");
    assert.equal(output.items[0]?.rawFree, true);
    assert.equal(output.items[0]?.secretFree, true);
    assert.deepEqual(output.items[0]?.riskReviewHints, [
      "review holder concentration manually",
      "compare with later outcome",
      "do not infer trading decision",
    ]);
    const serialized = JSON.stringify(output);
    assert.doesNotMatch(serialized, /rawJson/i);
    assert.doesNotMatch(serialized, /walletList/i);
    assert.doesNotMatch(serialized, /responseBody/i);
    assert.doesNotMatch(serialized, /apiKey/i);
    assertNoForbiddenOutputTerms(output);
  });
});

test("holder snapshot show returns not_found for a missing Token", async () => {
  await withTempDb(async ({ client }) => {
    const output: HolderSnapshotShowOutput = await showHolderSnapshots(client, {
      mint: "HolderSnapshotShowMissing111111111pump",
    });

    assert.deepEqual(output, {
      status: "not_found",
      mode: "read_only_holder_snapshot_show",
      mint: "HolderSnapshotShowMissing111111111pump",
      count: 0,
      items: [],
    });
    assertNoForbiddenOutputTerms(output);
  });
});
