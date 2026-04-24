import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

type TokenEnrichRescoreGeckoterminalOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  notifyEnabled: boolean;
  source: string;
  selection: {
    mint: string | null;
    selectedCount: number;
    selectedIncompleteCount: number;
    skippedCompleteCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    errorCount: number;
    enrichWriteCount: number;
    rescoreWriteCount: number;
    metaplexAttemptedCount: number;
    metaplexAvailableCount: number;
    metaplexWriteCount: number;
    metaplexSavedCount: number;
    metaplexErrorKindCounts: Record<string, number>;
    rateLimited: boolean;
    rateLimitedCount: number;
    abortedDueToRateLimit: boolean;
    skippedAfterRateLimit: number;
  };
  items: Array<{
    token: {
      mint: string;
      metadataStatus: string;
      currentSource: string | null;
      originSource: string | null;
    };
    selectedReason: string;
    status: string;
    fetchedSnapshot?: {
      name: string | null;
      symbol: string | null;
    };
    contextAvailable: boolean;
    contextWouldWrite: boolean;
    metaplexAttempted: boolean;
    metaplexAvailable: boolean;
    metaplexWouldWrite: boolean;
    metaplexErrorKind: string | null;
    enrichPlan?: {
      hasPatch: boolean;
      willUpdate: boolean;
      preview: {
        metadataStatus: string;
        name: string | null;
        symbol: string | null;
      };
    };
    rescorePreview?: {
      ready: boolean;
      scoreTotal: number;
      scoreRank: string;
      hardRejected: boolean;
    };
    writeSummary: {
      dryRun: boolean;
      enrichUpdated: boolean;
      rescoreUpdated: boolean;
      contextUpdated: boolean;
      metaplexContextUpdated: boolean;
    };
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-token-enrich-rescore-gecko-test-"));

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

async function runTokenEnrichRescoreGeckoterminal(
  args: string[],
  options?: {
    databaseUrl?: string;
    geckoSnapshotFile?: string;
    metaplexFixtureFile?: string;
  },
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `token-enrich-rescore-gecko-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `token-enrich-rescore-gecko-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokenEnrichRescoreGeckoterminal.ts",
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
          ...(options?.metaplexFixtureFile
            ? { METAPLEX_METADATA_URI_FILE: options.metaplexFixtureFile }
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

async function seedToken(
  databaseUrl: string,
  mint: string,
): Promise<void> {
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
        source: GECKO_SOURCE,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function seedBatchToken(
  databaseUrl: string,
  input: {
    mint: string;
    createdAt: Date;
    name?: string | null;
    symbol?: string | null;
    metadataStatus?: string;
  },
): Promise<void> {
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
        mint: input.mint,
        source: GECKO_SOURCE,
        name: input.name ?? null,
        symbol: input.symbol ?? null,
        metadataStatus: input.metadataStatus ?? "mint_only",
        createdAt: input.createdAt,
        importedAt: input.createdAt,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function readToken(
  databaseUrl: string,
  mint: string,
): Promise<{
  mint: string;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  rescoredAt: Date | null;
  reviewFlagsJson: unknown;
} | null> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.token.findUnique({
      where: { mint },
      select: {
        mint: true,
        name: true,
        symbol: true,
        metadataStatus: true,
        rescoredAt: true,
        reviewFlagsJson: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("tokenEnrichRescoreGeckoterminal boundary", async (t) => {
  await t.test("supports a deterministic single dry-run through env-backed fixtures", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${mint}`,
              type: "token",
              attributes: {
                address: mint,
                name: "Gecko Rescore Token",
                symbol: "GRT",
                description: "fixture description",
                websites: ["https://example.com/gecko-rescore"],
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(
          {
            status: "error",
            kind: "rpc_http_error",
            rateLimited: false,
            message: "metaplex fixture error",
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
        },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokenEnrichRescoreGeckoterminalOutput;
      assert.equal(parsed.mode, "single");
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.notifyEnabled, false);
      assert.equal(parsed.source, GECKO_SOURCE);
      assert.equal(parsed.selection.mint, mint);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.selection.selectedIncompleteCount, 1);
      assert.equal(parsed.selection.skippedCompleteCount, 0);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.enrichWriteCount, 0);
      assert.equal(parsed.summary.rescoreWriteCount, 0);
      assert.equal(parsed.summary.metaplexAttemptedCount, 1);
      assert.equal(parsed.summary.metaplexAvailableCount, 0);
      assert.equal(parsed.summary.metaplexWriteCount, 0);
      assert.equal(parsed.summary.metaplexSavedCount, 0);
      assert.deepEqual(parsed.summary.metaplexErrorKindCounts, {
        rpc_http_error: 1,
      });
      assert.equal(parsed.summary.rateLimited, false);
      assert.equal(parsed.summary.rateLimitedCount, 0);
      assert.equal(parsed.summary.abortedDueToRateLimit, false);
      assert.equal(parsed.summary.skippedAfterRateLimit, 0);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.token.mint, mint);
      assert.equal(parsed.items[0]?.token.metadataStatus, "mint_only");
      assert.equal(parsed.items[0]?.token.currentSource, GECKO_SOURCE);
      assert.equal(parsed.items[0]?.token.originSource, GECKO_SOURCE);
      assert.equal(parsed.items[0]?.selectedReason, "Token.createdAt");
      assert.equal(parsed.items[0]?.status, "ok");
      assert.equal(parsed.items[0]?.fetchedSnapshot?.name, "Gecko Rescore Token");
      assert.equal(parsed.items[0]?.fetchedSnapshot?.symbol, "GRT");
      assert.equal(parsed.items[0]?.contextAvailable, true);
      assert.equal(parsed.items[0]?.contextWouldWrite, true);
      assert.equal(parsed.items[0]?.metaplexAttempted, true);
      assert.equal(parsed.items[0]?.metaplexAvailable, false);
      assert.equal(parsed.items[0]?.metaplexWouldWrite, false);
      assert.equal(parsed.items[0]?.metaplexErrorKind, "rpc_http_error");
      assert.equal(parsed.items[0]?.enrichPlan?.hasPatch, true);
      assert.equal(parsed.items[0]?.enrichPlan?.willUpdate, true);
      assert.equal(parsed.items[0]?.enrichPlan?.preview.metadataStatus, "partial");
      assert.equal(parsed.items[0]?.enrichPlan?.preview.name, "Gecko Rescore Token");
      assert.equal(parsed.items[0]?.enrichPlan?.preview.symbol, "GRT");
      assert.equal(parsed.items[0]?.rescorePreview?.ready, true);
      assert.equal(typeof parsed.items[0]?.rescorePreview?.scoreTotal, "number");
      assert.equal(typeof parsed.items[0]?.rescorePreview?.scoreRank, "string");
      assert.equal(typeof parsed.items[0]?.rescorePreview?.hardRejected, "boolean");
      assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
      assert.equal(parsed.items[0]?.writeSummary.enrichUpdated, false);
      assert.equal(parsed.items[0]?.writeSummary.rescoreUpdated, false);
      assert.equal(parsed.items[0]?.writeSummary.contextUpdated, false);
      assert.equal(parsed.items[0]?.writeSummary.metaplexContextUpdated, false);
      assert.match(
        result.stderr,
        /\[token:enrich-rescore:geckoterminal\] mode=single/,
      );

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.mint, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
      assert.equal(token?.reviewFlagsJson, null);
    });
  });

  await t.test("selects the most recent incomplete gecko token and skips complete rows in recent batch mode", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "batch.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex.json");
      const newerCompleteMint = "GeckoBatchComplete1111111111111111111111111111";
      const newerIncompleteMint = "GeckoBatchIncomplete11111111111111111111111111";
      const olderIncompleteMint = "GeckoBatchOlder1111111111111111111111111111111";
      const now = Date.now();

      await runDbPush(databaseUrl);
      await seedBatchToken(databaseUrl, {
        mint: olderIncompleteMint,
        createdAt: new Date(now - 3 * 60_000),
      });
      await seedBatchToken(databaseUrl, {
        mint: newerIncompleteMint,
        createdAt: new Date(now - 2 * 60_000),
      });
      await seedBatchToken(databaseUrl, {
        mint: newerCompleteMint,
        createdAt: new Date(now - 60_000),
        name: "Already Complete",
        symbol: "DONE",
        metadataStatus: "partial",
      });

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${newerIncompleteMint}`,
              type: "token",
              attributes: {
                address: newerIncompleteMint,
                name: "Gecko Batch Token",
                symbol: "GBT",
                description: "batch fixture description",
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(
          {
            status: "error",
            kind: "rpc_http_error",
            rateLimited: false,
            message: "metaplex fixture error",
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runTokenEnrichRescoreGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10"],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
        },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokenEnrichRescoreGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.selection.mint, null);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.selection.selectedIncompleteCount, 1);
      assert.equal(parsed.selection.skippedCompleteCount, 1);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.token.mint, newerIncompleteMint);
      assert.equal(parsed.items[0]?.token.metadataStatus, "mint_only");
      assert.equal(parsed.items[0]?.token.originSource, GECKO_SOURCE);
      assert.equal(parsed.items[0]?.selectedReason, "Token.createdAt");
    });
  });

  await t.test("exits non-zero when notify is requested without write", async () => {
    const result = await runTokenEnrichRescoreGeckoterminal([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--notify",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--notify requires --write/);
    assert.match(
      result.stderr,
      /pnpm token:enrich-rescore:geckoterminal -- \[--mint <MINT>\] \[--limit <N>\] \[--sinceMinutes <N>\] \[--pumpOnly\] \[--write\] \[--notify\]/,
    );
  });

  await t.test("exits non-zero when the requested token does not exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing.db")}`;

      await runDbPush(databaseUrl);

      const result = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", "missing-token-mint"],
        { databaseUrl },
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Token not found for mint: missing-token-mint/);
      assert.match(
        result.stderr,
        /pnpm token:enrich-rescore:geckoterminal -- \[--mint <MINT>\] \[--limit <N>\] \[--sinceMinutes <N>\] \[--pumpOnly\] \[--write\] \[--notify\]/,
      );
    });
  });
});
