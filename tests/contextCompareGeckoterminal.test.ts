import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

const GECKO_ORIGIN_SOURCE = "geckoterminal.new_pools";

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

type ContextCompareGeckoterminalOutput = {
  readOnly: true;
  selection: {
    sinceHours: number;
    limit: number;
    sinceCutoff: string;
    geckoOriginTokenCount: number;
    skippedNonPumpCount: number;
    selectedCount: number;
  };
  comparedSources: Array<{
    id: string;
    label: string;
    endpoint: string;
  }>;
  availabilitySummary: Array<{
    sourceId: string;
    endpoint: string;
    totalChecked: number;
    okCount: number;
    fetchErrorCount: number;
    rateLimitedCount: number;
    nameAvailableCount: number;
    symbolAvailableCount: number;
    descriptionAvailableCount: number;
    websiteAvailableCount: number;
    xAvailableCount: number;
    telegramAvailableCount: number;
    anyLinksAvailableCount: number;
  }>;
  sampleResults: Array<{
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    sourceResults: Array<{
      sourceId: string;
      status: "ok" | "error";
      rateLimited: boolean;
      metadata: {
        name: string | null;
        symbol: string | null;
        description: string | null;
      } | null;
      links: {
        website: string | null;
        x: string | null;
        telegram: string | null;
        anyLinks: boolean;
      } | null;
      error: string | null;
    }>;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-context-compare-gecko-test-"));

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

async function runContextCompareGeckoterminal(
  args: string[],
  options?: {
    databaseUrl?: string;
    geckoSnapshotFile?: string;
    geckoSnapshotWithTopPoolsFile?: string;
  },
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `context-compare-gecko-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `context-compare-gecko-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/contextCompareGeckoterminal.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(options?.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}),
          ...(options?.geckoSnapshotFile
            ? { GECKOTERMINAL_TOKEN_SNAPSHOT_FILE: options.geckoSnapshotFile }
            : {}),
          ...(options?.geckoSnapshotWithTopPoolsFile
            ? {
                GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE:
                  options.geckoSnapshotWithTopPoolsFile,
              }
            : {}),
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
        source: GECKO_ORIGIN_SOURCE,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("context:compare:geckoterminal supports deterministic compare with fixture fallback", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-compare-success.db")}`;
    const geckoSnapshotFile = join(dir, "gecko-context-compare.json");
    const pumpMint = "GeckoContextComparePump111111111111111111111111pump";
    const nonPumpMint = "GeckoContextCompareNonPump1111111111111111111111";

    await runDbPush(databaseUrl);
    await seedToken(databaseUrl, pumpMint);
    await seedToken(databaseUrl, nonPumpMint);

    await writeFile(
      geckoSnapshotFile,
      JSON.stringify(
        {
          data: {
            id: `solana_${pumpMint}`,
            type: "token",
            attributes: {
              address: pumpMint,
              name: "context compare token",
              symbol: "CCTX",
              description: "context compare description",
              websites: ["https://example.com/context-compare"],
              twitter_username: "context_compare",
              telegram_handle: "contextcompare",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runContextCompareGeckoterminal(
      ["--limit", "1", "--sinceHours", "1"],
      {
        databaseUrl,
        geckoSnapshotFile,
      },
    );

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCompareGeckoterminalOutput;
    const summaryBySource = new Map(
      parsed.availabilitySummary.map((item) => [item.sourceId, item] as const),
    );
    const plainSummary = summaryBySource.get("geckoterminal.token_snapshot");
    const topPoolsSummary = summaryBySource.get("geckoterminal.token_snapshot_with_top_pools");

    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.selection.sinceHours, 1);
    assert.equal(parsed.selection.limit, 1);
    assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(parsed.selection.geckoOriginTokenCount, 2);
    assert.equal(parsed.selection.skippedNonPumpCount, 1);
    assert.equal(parsed.selection.selectedCount, 1);
    assert.equal(parsed.comparedSources.length, 2);
    assert.equal(plainSummary?.totalChecked, 1);
    assert.equal(plainSummary?.okCount, 1);
    assert.equal(plainSummary?.fetchErrorCount, 0);
    assert.equal(plainSummary?.rateLimitedCount, 0);
    assert.equal(plainSummary?.descriptionAvailableCount, 1);
    assert.equal(plainSummary?.websiteAvailableCount, 1);
    assert.equal(topPoolsSummary?.totalChecked, 1);
    assert.equal(topPoolsSummary?.okCount, 1);
    assert.equal(topPoolsSummary?.fetchErrorCount, 0);
    assert.equal(topPoolsSummary?.rateLimitedCount, 0);
    assert.equal(topPoolsSummary?.xAvailableCount, 1);
    assert.equal(topPoolsSummary?.telegramAvailableCount, 1);
    assert.equal(parsed.sampleResults.length, 1);
    assert.equal(parsed.sampleResults[0]?.mint, pumpMint);
    assert.equal(parsed.sampleResults[0]?.currentSource, GECKO_ORIGIN_SOURCE);
    assert.equal(parsed.sampleResults[0]?.originSource, GECKO_ORIGIN_SOURCE);
    assert.equal(parsed.sampleResults[0]?.selectionAnchorKind, "createdAt");
    assert.equal(parsed.sampleResults[0]?.sourceResults.length, 2);
    assert.deepEqual(
      parsed.sampleResults[0]?.sourceResults.map((item) => item.sourceId).sort(),
      [
        "geckoterminal.token_snapshot",
        "geckoterminal.token_snapshot_with_top_pools",
      ],
    );
    assert.equal(parsed.sampleResults[0]?.sourceResults[0]?.status, "ok");
    assert.equal(parsed.sampleResults[0]?.sourceResults[0]?.rateLimited, false);
    assert.equal(
      parsed.sampleResults[0]?.sourceResults[0]?.metadata?.description,
      "context compare description",
    );
    assert.equal(
      parsed.sampleResults[0]?.sourceResults[0]?.links?.website,
      "https://example.com/context-compare",
    );
    assert.equal(parsed.sampleResults[0]?.sourceResults[0]?.links?.anyLinks, true);
  });
});

test("context:compare:geckoterminal rejects unknown args", async () => {
  const result = await runContextCompareGeckoterminal(["--mint", "SomeMint"]);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.notEqual(result.code, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.match(result.stderr, /Unknown arg: --mint/);
});

test("context:compare:geckoterminal reports a mixed summary when one source fails and the other succeeds", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-compare-mixed.db")}`;
    const geckoSnapshotFile = join(dir, "gecko-context-compare-invalid.json");
    const geckoSnapshotWithTopPoolsFile = join(dir, "gecko-context-compare-top-pools.json");
    const pumpMint = "GeckoContextCompareMixedPump11111111111111111111pump";
    const nonPumpMint = "GeckoContextCompareMixedNonPump1111111111111111111";

    await runDbPush(databaseUrl);
    await seedToken(databaseUrl, pumpMint);
    await seedToken(databaseUrl, nonPumpMint);

    await writeFile(geckoSnapshotFile, "{not-json", "utf-8");
    await writeFile(
      geckoSnapshotWithTopPoolsFile,
      JSON.stringify(
        {
          data: {
            id: `solana_${pumpMint}`,
            type: "token",
            attributes: {
              address: pumpMint,
              name: "context compare top pools token",
              symbol: "CCTP",
              description: "top pools description",
              websites: ["https://example.com/context-compare-top-pools"],
              telegram_handle: "contextcomparetoppools",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runContextCompareGeckoterminal(
      ["--limit", "1", "--sinceHours", "1"],
      {
        databaseUrl,
        geckoSnapshotFile,
        geckoSnapshotWithTopPoolsFile,
      },
    );

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCompareGeckoterminalOutput;
    const summaryBySource = new Map(
      parsed.availabilitySummary.map((item) => [item.sourceId, item] as const),
    );
    const plainSummary = summaryBySource.get("geckoterminal.token_snapshot");
    const topPoolsSummary = summaryBySource.get("geckoterminal.token_snapshot_with_top_pools");
    const sourceResults = parsed.sampleResults[0]?.sourceResults ?? [];
    const sourceResultById = new Map(sourceResults.map((item) => [item.sourceId, item] as const));
    const plainResult = sourceResultById.get("geckoterminal.token_snapshot");
    const topPoolsResult = sourceResultById.get("geckoterminal.token_snapshot_with_top_pools");

    assert.deepEqual(
      parsed.comparedSources.map((item) => item.id),
      [
        "geckoterminal.token_snapshot",
        "geckoterminal.token_snapshot_with_top_pools",
      ],
    );
    assert.equal(plainSummary?.totalChecked, 1);
    assert.equal(plainSummary?.okCount, 0);
    assert.equal(plainSummary?.fetchErrorCount, 1);
    assert.equal(plainSummary?.rateLimitedCount, 0);
    assert.equal(topPoolsSummary?.totalChecked, 1);
    assert.equal(topPoolsSummary?.okCount, 1);
    assert.equal(topPoolsSummary?.fetchErrorCount, 0);
    assert.equal(topPoolsSummary?.rateLimitedCount, 0);
    assert.equal(parsed.sampleResults.length, 1);
    assert.equal(plainResult?.status, "error");
    assert.equal(plainResult?.rateLimited, false);
    assert.equal(plainResult?.metadata, null);
    assert.equal(plainResult?.links, null);
    assert.equal(typeof plainResult?.error, "string");
    assert.equal(topPoolsResult?.status, "ok");
    assert.equal(topPoolsResult?.rateLimited, false);
    assert.equal(topPoolsResult?.metadata?.description, "top pools description");
    assert.equal(topPoolsResult?.links?.telegram, "https://t.me/contextcomparetoppools");
  });
});

test("context:compare:geckoterminal returns an empty success result when no matching tokens exist", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-compare-empty.db")}`;

    await runDbPush(databaseUrl);

    const result = await runContextCompareGeckoterminal(["--limit", "5", "--sinceHours", "1"], {
      databaseUrl,
    });

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCompareGeckoterminalOutput;

    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.selection.sinceHours, 1);
    assert.equal(parsed.selection.limit, 5);
    assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(parsed.selection.geckoOriginTokenCount, 0);
    assert.equal(parsed.selection.skippedNonPumpCount, 0);
    assert.equal(parsed.selection.selectedCount, 0);
    assert.equal(parsed.comparedSources.length, 2);
    assert.deepEqual(
      parsed.availabilitySummary.map((item) => ({
        sourceId: item.sourceId,
        totalChecked: item.totalChecked,
        okCount: item.okCount,
        fetchErrorCount: item.fetchErrorCount,
      })),
      [
        {
          sourceId: "geckoterminal.token_snapshot",
          totalChecked: 0,
          okCount: 0,
          fetchErrorCount: 0,
        },
        {
          sourceId: "geckoterminal.token_snapshot_with_top_pools",
          totalChecked: 0,
          okCount: 0,
          fetchErrorCount: 0,
        },
      ],
    );
    assert.deepEqual(parsed.sampleResults, []);
  });
});
