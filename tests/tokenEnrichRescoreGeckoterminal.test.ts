import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR,
  runGeckoTokenWriteForMint,
  toGeckoTokenEnrichRescoreCliItem,
  type GeckoTokenEnrichRescoreCliToken,
  type GeckoTokenWriteExistingToken,
} from "../src/cli/geckoterminalTokenWriteShared.ts";

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
    selectedIncompleteCount: number;
    skippedCompleteCount: number;
    okCount: number;
    errorCount: number;
    enrichWriteCount: number;
    rescoreWriteCount: number;
    metaplexAttemptedCount: number;
    metaplexAvailableCount: number;
    metaplexWriteCount: number;
    metaplexSavedCount: number;
    metaplexErrorKindCounts: Record<string, number>;
    notifyCandidateCount: number;
    notifyWouldSendCount: number;
    notifySentCount: number;
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
    savedContextFields: string[];
    metaplexAttempted: boolean;
    metaplexAvailable: boolean;
    metaplexWouldWrite: boolean;
    metaplexSavedFields: string[];
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
    notifyCandidate: boolean;
    notifyEligibleBefore: boolean;
    notifyEligibleAfter: boolean;
    notifyWouldSend: boolean;
    notifySent: boolean;
    writeSummary: {
      dryRun: boolean;
      enrichUpdated: boolean;
      rescoreUpdated: boolean;
      contextUpdated: boolean;
      metaplexContextUpdated: boolean;
    };
    error?: string;
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
    geckoSnapshotErrorOnce?: string;
    metaplexFixtureFile?: string;
    helperShadow?: boolean;
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
          ...(options?.geckoSnapshotErrorOnce
            ? { GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE: options.geckoSnapshotErrorOnce }
            : {}),
          ...(options?.metaplexFixtureFile
            ? { METAPLEX_METADATA_URI_FILE: options.metaplexFixtureFile }
            : {}),
          LOWCAP_GECKO_TOKEN_WRITE_HELPER_SHADOW: options?.helperShadow ? "1" : "",
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

async function seedTokenWithContext(
  databaseUrl: string,
  input: {
    mint: string;
    entrySnapshot: Record<string, unknown>;
    reviewFlagsJson: Record<string, unknown>;
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
        metadataStatus: "mint_only",
        entrySnapshot: input.entrySnapshot,
        reviewFlagsJson: input.reviewFlagsJson,
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

  await t.test("matches helper adapter output for a deterministic single dry-run fixture", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "parity.db")}`;
      const mint = "GeckoParity1111111111111111111111111111111111";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex.json");
      const geckoSnapshot = {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Gecko Parity Token",
            symbol: "GPT",
            description: "parity fixture description",
            websites: ["https://example.com/gecko-parity"],
          },
        },
      };
      const metaplexFixture = {
        status: "error",
        kind: "rpc_http_error",
        rateLimited: false,
        message: "metaplex parity fixture error",
      };

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(geckoSnapshot, null, 2),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(metaplexFixture, null, 2),
        "utf8",
      );

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
          helperShadow: true,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);
      assert.equal(
        Object.prototype.hasOwnProperty.call(parsed, "helperResult"),
        false,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(cliItem, "helperResult"),
        false,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(cliItem, "adapterItem"),
        false,
      );

      const existingToken: GeckoTokenWriteExistingToken = {
        mint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        reviewFlagsJson: null,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => geckoSnapshot,
          fetchMetaplexContext: async () => metaplexFixture,
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(adapterItem.status, cliItem.status);
      assert.equal(adapterItem.selectedReason, cliItem.selectedReason);
      assert.equal(
        adapterItem.fetchedSnapshot?.name,
        cliItem.fetchedSnapshot?.name,
      );
      assert.equal(
        adapterItem.fetchedSnapshot?.symbol,
        cliItem.fetchedSnapshot?.symbol,
      );
      assert.equal(adapterItem.contextAvailable, cliItem.contextAvailable);
      assert.equal(adapterItem.contextWouldWrite, cliItem.contextWouldWrite);
      assert.equal(adapterItem.metaplexAttempted, cliItem.metaplexAttempted);
      assert.equal(adapterItem.metaplexAvailable, cliItem.metaplexAvailable);
      assert.equal(adapterItem.metaplexWouldWrite, cliItem.metaplexWouldWrite);
      assert.equal(adapterItem.metaplexErrorKind, cliItem.metaplexErrorKind);
      assert.equal(adapterItem.enrichPlan?.hasPatch, cliItem.enrichPlan?.hasPatch);
      assert.equal(
        adapterItem.enrichPlan?.willUpdate,
        cliItem.enrichPlan?.willUpdate,
      );
      assert.deepEqual(
        adapterItem.enrichPlan?.preview,
        cliItem.enrichPlan?.preview,
      );
      assert.equal(adapterItem.rescorePreview?.ready, cliItem.rescorePreview?.ready);
      assert.equal(
        adapterItem.rescorePreview?.scoreTotal,
        cliItem.rescorePreview?.scoreTotal,
      );
      assert.equal(
        adapterItem.rescorePreview?.scoreRank,
        cliItem.rescorePreview?.scoreRank,
      );
      assert.equal(
        adapterItem.rescorePreview?.hardRejected,
        cliItem.rescorePreview?.hardRejected,
      );
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(
        adapterItem.notifyEligibleBefore,
        cliItem.notifyEligibleBefore,
      );
      assert.equal(adapterItem.notifyEligibleAfter, cliItem.notifyEligibleAfter);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);
      assert.deepEqual(adapterItem.writeSummary, cliItem.writeSummary);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
      assert.equal(token?.reviewFlagsJson, null);
    });
  });

  await t.test("matches context, metaplex, and review flags parity between CLI dry-run and helper adapter", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "context-metaplex-parity.db")}`;
      const mint = "GeckoContextMetaplexParity111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex.json");
      const entrySnapshot = {
        contextCapture: {
          geckoterminalTokenSnapshot: {
            source: "geckoterminal.token_snapshot",
            capturedAt: "2026-04-24T00:00:00.000Z",
            address: mint,
            metadataText: {
              name: "Saved Context Token",
              symbol: "SAVED",
              description: null,
            },
            links: {
              website: "https://saved.example/gecko",
              x: null,
              telegram: null,
              websites: ["https://saved.example/gecko"],
              xCandidates: [],
              telegramCandidates: [],
              otherLinks: [],
            },
            availableFields: [
              "metadata.name",
              "metadata.symbol",
              "links.website",
            ],
            missingFields: [
              "metadata.description",
              "links.x",
              "links.telegram",
              "links.other",
            ],
          },
          metaplexMetadataUri: {
            source: "metaplex.metadata_uri",
            capturedAt: "2026-04-24T00:00:00.000Z",
            metadataPda: "saved-metaplex-pda",
            uri: "https://metadata.example/saved.json",
            metadataText: {
              description: "saved metaplex description",
            },
            links: {
              website: "https://saved.example/metaplex",
              x: null,
              telegram: null,
              anyLinks: true,
              websites: ["https://saved.example/metaplex"],
              xCandidates: [],
              telegramCandidates: [],
              otherLinks: [],
            },
            availableFields: ["metadata.description", "links.website"],
            missingFields: ["links.x", "links.telegram", "links.other"],
          },
        },
      };
      const reviewFlagsJson = {
        hasWebsite: true,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 2,
      };
      const geckoSnapshot = {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Current Context Token",
            symbol: "CCTX",
            description: "current gecko description",
            websites: ["https://current.example/gecko"],
            twitter_username: "current_context",
            telegram: "currentcontext",
          },
        },
      };
      const metaplexFixture = {
        onchain: {
          mint,
          uri: "https://metadata.example/current.json",
          metadataPda: "current-metaplex-pda",
        },
        offchain: {
          description: "current metaplex description",
          external_url: "https://current.example/metaplex",
          twitter: "metaplex_context",
          telegram: "metaplexcontext",
          discord: "https://discord.gg/metaplex-context",
        },
        detail: {
          metadataPda: "current-metaplex-pda",
          uri: "https://metadata.example/current.json",
          hasOffchain: true,
        },
      };

      await runDbPush(databaseUrl);
      await seedTokenWithContext(databaseUrl, {
        mint,
        entrySnapshot,
        reviewFlagsJson,
      });
      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(geckoSnapshot, null, 2),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(metaplexFixture, null, 2),
        "utf8",
      );

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);

      const existingToken: GeckoTokenWriteExistingToken = {
        mint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        entrySnapshot,
        reviewFlagsJson,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => geckoSnapshot,
          fetchMetaplexContext: async () => metaplexFixture,
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(cliItem.contextAvailable, true);
      assert.equal(cliItem.contextWouldWrite, true);
      assert.equal(cliItem.metaplexAttempted, true);
      assert.equal(cliItem.metaplexAvailable, true);
      assert.equal(cliItem.metaplexWouldWrite, true);
      assert.equal(helperResult.reviewFlagsWouldWrite, true);
      assert.equal(helperResult.reviewFlagsPreview?.wouldWrite, true);
      assert.deepEqual(helperResult.reviewFlagsPreview?.flags, {
        hasWebsite: true,
        hasX: true,
        hasTelegram: true,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 7,
      });

      assert.equal(adapterItem.status, cliItem.status);
      assert.equal(adapterItem.selectedReason, cliItem.selectedReason);
      assert.equal(
        adapterItem.fetchedSnapshot?.name,
        cliItem.fetchedSnapshot?.name,
      );
      assert.equal(
        adapterItem.fetchedSnapshot?.symbol,
        cliItem.fetchedSnapshot?.symbol,
      );
      assert.equal(adapterItem.contextAvailable, cliItem.contextAvailable);
      assert.equal(adapterItem.contextWouldWrite, cliItem.contextWouldWrite);
      assert.deepEqual(adapterItem.savedContextFields, cliItem.savedContextFields);
      assert.equal(adapterItem.metaplexAttempted, cliItem.metaplexAttempted);
      assert.equal(adapterItem.metaplexAvailable, cliItem.metaplexAvailable);
      assert.equal(adapterItem.metaplexWouldWrite, cliItem.metaplexWouldWrite);
      assert.deepEqual(
        adapterItem.metaplexSavedFields,
        cliItem.metaplexSavedFields,
      );
      assert.equal(adapterItem.metaplexErrorKind, cliItem.metaplexErrorKind);
      assert.equal(adapterItem.enrichPlan?.hasPatch, cliItem.enrichPlan?.hasPatch);
      assert.equal(
        adapterItem.enrichPlan?.willUpdate,
        cliItem.enrichPlan?.willUpdate,
      );
      assert.equal(adapterItem.rescorePreview?.ready, cliItem.rescorePreview?.ready);
      assert.equal(
        adapterItem.rescorePreview?.scoreRank,
        cliItem.rescorePreview?.scoreRank,
      );
      assert.equal(
        adapterItem.rescorePreview?.scoreTotal,
        cliItem.rescorePreview?.scoreTotal,
      );
      assert.equal(
        adapterItem.rescorePreview?.hardRejected,
        cliItem.rescorePreview?.hardRejected,
      );
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(
        adapterItem.notifyEligibleBefore,
        cliItem.notifyEligibleBefore,
      );
      assert.equal(adapterItem.notifyEligibleAfter, cliItem.notifyEligibleAfter);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);
      assert.equal(adapterItem.writeSummary.dryRun, cliItem.writeSummary.dryRun);
      assert.equal(
        adapterItem.writeSummary.enrichUpdated,
        cliItem.writeSummary.enrichUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.rescoreUpdated,
        cliItem.writeSummary.rescoreUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.contextUpdated,
        cliItem.writeSummary.contextUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.metaplexContextUpdated,
        cliItem.writeSummary.metaplexContextUpdated,
      );

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
      assert.deepEqual(token?.reviewFlagsJson, reviewFlagsJson);
    });
  });

  await t.test("matches Metaplex metadata missing parity between CLI dry-run and helper adapter", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "metaplex-missing-parity.db")}`;
      const mint = "GeckoMetaplexMissingParity111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex-missing.json");
      const geckoSnapshot = {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Metaplex Missing Token",
            symbol: "MMT",
            description: "gecko context survives missing metaplex metadata",
            websites: ["https://example.com/metaplex-missing"],
            twitter_username: "metaplex_missing",
            telegram_handle: "metaplexmissing",
          },
        },
      };
      const metaplexFixture = {
        status: "not_found",
        reason: "metadata_account_missing",
        message: `No Metaplex metadata account found for mint: ${mint}`,
      };

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(geckoSnapshot, null, 2),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(metaplexFixture, null, 2),
        "utf8",
      );

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);

      const existingToken: GeckoTokenWriteExistingToken = {
        mint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        reviewFlagsJson: null,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => geckoSnapshot,
          fetchMetaplexContext: async () => metaplexFixture,
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(cliItem.status, "ok");
      assert.equal(cliItem.metaplexAttempted, true);
      assert.equal(cliItem.metaplexAvailable, false);
      assert.equal(cliItem.metaplexWouldWrite, false);
      assert.equal(cliItem.metaplexErrorKind, "metadata_account_missing");
      assert.equal(cliItem.enrichPlan?.hasPatch, true);
      assert.equal(cliItem.enrichPlan?.willUpdate, true);
      assert.equal(cliItem.rescorePreview?.ready, true);
      assert.equal(cliItem.contextAvailable, true);
      assert.equal(cliItem.contextWouldWrite, true);
      assert.equal(cliItem.writeSummary.dryRun, true);

      assert.equal(helperResult.status, "ok");
      assert.equal(helperResult.metaplexPreview?.attempted, true);
      assert.equal(helperResult.metaplexPreview?.available, false);
      assert.equal(helperResult.metaplexPreview?.wouldWrite, false);
      assert.equal(helperResult.metaplexPreview?.errorKind, "metadata_account_missing");
      assert.equal(helperResult.metaplexPreview?.rateLimited, false);
      assert.equal(helperResult.metaplexErrorKind, "metadata_account_missing");
      assert.equal(helperResult.metaplexContextWouldWrite, false);
      assert.equal(helperResult.rateLimited, false);
      assert.equal(helperResult.rateLimitScope, null);

      assert.equal(adapterItem.status, cliItem.status);
      assert.equal(adapterItem.selectedReason, cliItem.selectedReason);
      assert.equal(
        adapterItem.fetchedSnapshot?.name,
        cliItem.fetchedSnapshot?.name,
      );
      assert.equal(
        adapterItem.fetchedSnapshot?.symbol,
        cliItem.fetchedSnapshot?.symbol,
      );
      assert.equal(adapterItem.contextAvailable, cliItem.contextAvailable);
      assert.equal(adapterItem.contextWouldWrite, cliItem.contextWouldWrite);
      assert.equal(adapterItem.metaplexAttempted, cliItem.metaplexAttempted);
      assert.equal(adapterItem.metaplexAvailable, cliItem.metaplexAvailable);
      assert.equal(adapterItem.metaplexWouldWrite, cliItem.metaplexWouldWrite);
      assert.equal(adapterItem.metaplexErrorKind, cliItem.metaplexErrorKind);
      assert.equal(adapterItem.enrichPlan?.hasPatch, cliItem.enrichPlan?.hasPatch);
      assert.equal(
        adapterItem.enrichPlan?.willUpdate,
        cliItem.enrichPlan?.willUpdate,
      );
      assert.equal(adapterItem.rescorePreview?.ready, cliItem.rescorePreview?.ready);
      assert.equal(
        adapterItem.rescorePreview?.scoreRank,
        cliItem.rescorePreview?.scoreRank,
      );
      assert.equal(
        adapterItem.rescorePreview?.scoreTotal,
        cliItem.rescorePreview?.scoreTotal,
      );
      assert.equal(
        adapterItem.rescorePreview?.hardRejected,
        cliItem.rescorePreview?.hardRejected,
      );
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);
      assert.equal(adapterItem.writeSummary.dryRun, cliItem.writeSummary.dryRun);
      assert.equal(
        adapterItem.writeSummary.enrichUpdated,
        cliItem.writeSummary.enrichUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.rescoreUpdated,
        cliItem.writeSummary.rescoreUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.contextUpdated,
        cliItem.writeSummary.contextUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.metaplexContextUpdated,
        cliItem.writeSummary.metaplexContextUpdated,
      );

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
      assert.equal(token?.reviewFlagsJson, null);
    });
  });

  await t.test("matches Metaplex-only rate limit parity between CLI dry-run and helper adapter", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "metaplex-rate-limit-parity.db")}`;
      const mint = "GeckoMetaplexRateLimitParity1111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex-rate-limit.json");
      const geckoSnapshot = {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Metaplex Rate Limit Token",
            symbol: "MRL",
            description: "gecko context survives metaplex-only rate limits",
            websites: ["https://example.com/metaplex-rate-limit"],
            twitter_username: "metaplex_rate_limit",
            telegram_handle: "metaplexratelimit",
          },
        },
      };
      const metaplexFixture = {
        status: "error",
        kind: "rate_limited",
        rateLimited: true,
        message: "metaplex.metadata_uri request failed: 429 Too Many Requests",
      };

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(geckoSnapshot, null, 2),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(metaplexFixture, null, 2),
        "utf8",
      );

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);

      const existingToken: GeckoTokenWriteExistingToken = {
        mint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        reviewFlagsJson: null,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => geckoSnapshot,
          fetchMetaplexContext: async () => metaplexFixture,
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(cliItem.status, "ok");
      assert.equal(cliItem.metaplexAttempted, true);
      assert.equal(cliItem.metaplexAvailable, false);
      assert.equal(cliItem.metaplexWouldWrite, false);
      assert.equal(cliItem.metaplexErrorKind, "rate_limited");
      assert.equal(cliItem.enrichPlan?.hasPatch, true);
      assert.equal(cliItem.enrichPlan?.willUpdate, true);
      assert.equal(cliItem.rescorePreview?.ready, true);
      assert.equal(cliItem.contextAvailable, true);
      assert.equal(cliItem.contextWouldWrite, true);
      assert.equal(cliItem.writeSummary.dryRun, true);

      assert.equal(helperResult.status, "ok");
      assert.equal(helperResult.rateLimited, false);
      assert.equal(helperResult.rateLimitScope, null);
      assert.equal(helperResult.metaplexPreview?.attempted, true);
      assert.equal(helperResult.metaplexPreview?.available, false);
      assert.equal(helperResult.metaplexPreview?.wouldWrite, false);
      assert.equal(helperResult.metaplexPreview?.errorKind, "rate_limited");
      assert.equal(helperResult.metaplexPreview?.rateLimited, true);
      assert.equal(helperResult.metaplexErrorKind, "rate_limited");
      assert.equal(helperResult.metaplexContextWouldWrite, false);

      assert.equal(adapterItem.status, cliItem.status);
      assert.equal(adapterItem.selectedReason, cliItem.selectedReason);
      assert.equal(
        adapterItem.fetchedSnapshot?.name,
        cliItem.fetchedSnapshot?.name,
      );
      assert.equal(
        adapterItem.fetchedSnapshot?.symbol,
        cliItem.fetchedSnapshot?.symbol,
      );
      assert.equal(adapterItem.contextAvailable, cliItem.contextAvailable);
      assert.equal(adapterItem.contextWouldWrite, cliItem.contextWouldWrite);
      assert.equal(adapterItem.metaplexAttempted, cliItem.metaplexAttempted);
      assert.equal(adapterItem.metaplexAvailable, cliItem.metaplexAvailable);
      assert.equal(adapterItem.metaplexWouldWrite, cliItem.metaplexWouldWrite);
      assert.equal(adapterItem.metaplexErrorKind, cliItem.metaplexErrorKind);
      assert.equal(adapterItem.enrichPlan?.hasPatch, cliItem.enrichPlan?.hasPatch);
      assert.equal(
        adapterItem.enrichPlan?.willUpdate,
        cliItem.enrichPlan?.willUpdate,
      );
      assert.equal(adapterItem.rescorePreview?.ready, cliItem.rescorePreview?.ready);
      assert.equal(
        adapterItem.rescorePreview?.scoreRank,
        cliItem.rescorePreview?.scoreRank,
      );
      assert.equal(
        adapterItem.rescorePreview?.scoreTotal,
        cliItem.rescorePreview?.scoreTotal,
      );
      assert.equal(
        adapterItem.rescorePreview?.hardRejected,
        cliItem.rescorePreview?.hardRejected,
      );
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);
      assert.equal(adapterItem.writeSummary.dryRun, cliItem.writeSummary.dryRun);
      assert.equal(
        adapterItem.writeSummary.enrichUpdated,
        cliItem.writeSummary.enrichUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.rescoreUpdated,
        cliItem.writeSummary.rescoreUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.contextUpdated,
        cliItem.writeSummary.contextUpdated,
      );
      assert.equal(
        adapterItem.writeSummary.metaplexContextUpdated,
        cliItem.writeSummary.metaplexContextUpdated,
      );

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
      assert.equal(token?.reviewFlagsJson, null);
    });
  });

  await t.test("matches primary Gecko rate limit parity between CLI dry-run and helper adapter", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "primary-gecko-rate-limit-parity.db")}`;
      const mint = "GeckoPrimaryRateLimitParity111111111111111pump";
      const rateLimitError =
        "GeckoTerminal token snapshot request failed: 429 Too Many Requests";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotErrorOnce: rateLimitError,
          helperShadow: true,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);

      const existingToken: GeckoTokenWriteExistingToken = {
        mint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        reviewFlagsJson: null,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => {
            throw new Error(rateLimitError);
          },
          fetchMetaplexContext: async () => {
            throw new Error("Metaplex preview should not run after primary Gecko 429");
          },
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(cliItem.status, "error");
      assert.match(cliItem.error ?? "", /429 Too Many Requests/);
      assert.equal(cliItem.fetchedSnapshot, undefined);
      assert.equal(cliItem.contextAvailable, false);
      assert.equal(cliItem.contextWouldWrite, false);
      assert.equal(cliItem.metaplexAttempted, false);
      assert.equal(cliItem.metaplexAvailable, false);
      assert.equal(cliItem.metaplexWouldWrite, false);
      assert.equal(cliItem.metaplexErrorKind, null);
      assert.equal(cliItem.enrichPlan, undefined);
      assert.equal(cliItem.rescorePreview, undefined);
      assert.equal(cliItem.notifyWouldSend, false);
      assert.equal(cliItem.notifySent, false);
      assert.deepEqual(cliItem.writeSummary, {
        dryRun: true,
        enrichUpdated: false,
        rescoreUpdated: false,
        contextUpdated: false,
        metaplexContextUpdated: false,
      });

      assert.equal(helperResult.status, "rate_limited");
      assert.equal(helperResult.rateLimited, true);
      assert.equal(helperResult.rateLimitScope, "geckoterminal");
      assert.equal(helperResult.fetchedSnapshot, null);
      assert.equal(helperResult.enrichPlan, null);
      assert.equal(helperResult.rescorePreview, null);
      assert.equal(helperResult.contextPreview, null);
      assert.equal(helperResult.metaplexPreview, null);
      assert.equal(helperResult.reviewFlagsPreview, null);

      assert.equal(adapterItem.status, cliItem.status);
      assert.equal(adapterItem.selectedReason, cliItem.selectedReason);
      assert.equal(adapterItem.fetchedSnapshot, undefined);
      assert.equal(adapterItem.contextAvailable, cliItem.contextAvailable);
      assert.equal(adapterItem.contextWouldWrite, cliItem.contextWouldWrite);
      assert.equal(adapterItem.metaplexAttempted, cliItem.metaplexAttempted);
      assert.equal(adapterItem.metaplexAvailable, cliItem.metaplexAvailable);
      assert.equal(adapterItem.metaplexWouldWrite, cliItem.metaplexWouldWrite);
      assert.equal(adapterItem.metaplexErrorKind, cliItem.metaplexErrorKind);
      assert.equal(adapterItem.enrichPlan, undefined);
      assert.equal(adapterItem.rescorePreview, undefined);
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);
      assert.deepEqual(adapterItem.writeSummary, cliItem.writeSummary);
      assert.match(adapterItem.error ?? "", /429 Too Many Requests/);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
      assert.equal(token?.reviewFlagsJson, null);
    });
  });

  await t.test("matches primary Gecko invalid shape parity between CLI dry-run and helper adapter", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "primary-gecko-invalid-shape-parity.db")}`;
      const mint = "GeckoPrimaryInvalidShapeParity111111111111pump";
      const geckoSnapshotFile = join(dir, "invalid-gecko-snapshot.json");
      const invalidSnapshot = {
        data: {
          id: `solana_${mint}`,
          type: "token",
        },
      };

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(invalidSnapshot, null, 2),
        "utf8",
      );

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--mint", mint],
        {
          databaseUrl,
          geckoSnapshotFile,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);

      const existingToken: GeckoTokenWriteExistingToken = {
        mint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        reviewFlagsJson: null,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => invalidSnapshot,
          fetchMetaplexContext: async () => {
            throw new Error("Metaplex preview should not run after invalid Gecko shape");
          },
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(cliItem.status, "error");
      assert.match(cliItem.error ?? "", /raw\.data\.attributes|shape/i);
      assert.equal(cliItem.fetchedSnapshot, undefined);
      assert.equal(cliItem.contextAvailable, false);
      assert.equal(cliItem.contextWouldWrite, false);
      assert.equal(cliItem.metaplexAttempted, false);
      assert.equal(cliItem.metaplexAvailable, false);
      assert.equal(cliItem.metaplexWouldWrite, false);
      assert.equal(cliItem.metaplexErrorKind, null);
      assert.equal(cliItem.enrichPlan, undefined);
      assert.equal(cliItem.rescorePreview, undefined);
      assert.equal(cliItem.notifyWouldSend, false);
      assert.equal(cliItem.notifySent, false);
      assert.deepEqual(cliItem.writeSummary, {
        dryRun: true,
        enrichUpdated: false,
        rescoreUpdated: false,
        contextUpdated: false,
        metaplexContextUpdated: false,
      });

      assert.equal(helperResult.status, "error");
      assert.equal(helperResult.error, GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
      assert.equal(helperResult.rateLimited, false);
      assert.equal(helperResult.rateLimitScope, null);
      assert.equal(helperResult.fetchedSnapshot, null);
      assert.equal(helperResult.enrichPlan, null);
      assert.equal(helperResult.rescorePreview, null);
      assert.equal(helperResult.contextPreview, null);
      assert.equal(helperResult.metaplexPreview, null);
      assert.equal(helperResult.reviewFlagsPreview, null);

      assert.equal(adapterItem.status, cliItem.status);
      assert.equal(adapterItem.selectedReason, cliItem.selectedReason);
      assert.equal(adapterItem.fetchedSnapshot, undefined);
      assert.equal(adapterItem.contextAvailable, cliItem.contextAvailable);
      assert.equal(adapterItem.contextWouldWrite, cliItem.contextWouldWrite);
      assert.equal(adapterItem.metaplexAttempted, cliItem.metaplexAttempted);
      assert.equal(adapterItem.metaplexAvailable, cliItem.metaplexAvailable);
      assert.equal(adapterItem.metaplexWouldWrite, cliItem.metaplexWouldWrite);
      assert.equal(adapterItem.metaplexErrorKind, cliItem.metaplexErrorKind);
      assert.equal(adapterItem.enrichPlan, undefined);
      assert.equal(adapterItem.rescorePreview, undefined);
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);
      assert.deepEqual(adapterItem.writeSummary, cliItem.writeSummary);
      assert.match(adapterItem.error ?? "", /geckoterminal_snapshot_shape_error/);

      const token = await readToken(databaseUrl, mint);
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

  await t.test("surfaces notifyWouldSend in dry-run preview when the selected token newly becomes notify-eligible", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "notify-preview.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex.json");
      const newerCompleteMint = "GeckoNotifyComplete111111111111111111111111111";
      const targetMint = "GeckoNotifyTarget1111111111111111111111111111111";
      const olderIncompleteMint = "GeckoNotifyOlder111111111111111111111111111111";
      const now = Date.now();

      await runDbPush(databaseUrl);
      await seedBatchToken(databaseUrl, {
        mint: olderIncompleteMint,
        createdAt: new Date(now - 3 * 60_000),
      });
      await seedBatchToken(databaseUrl, {
        mint: targetMint,
        createdAt: new Date(now - 2 * 60_000),
      });
      await seedBatchToken(databaseUrl, {
        mint: newerCompleteMint,
        createdAt: new Date(now - 60_000),
        name: "Already Complete",
        symbol: "ALRDY",
        metadataStatus: "partial",
      });

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${targetMint}`,
              type: "token",
              attributes: {
                address: targetMint,
                name: "pokemon dog newinfo",
                symbol: "SMGET",
                description: "gecko enrich context description",
                websites: ["https://example.com/gecko-enrich"],
                twitter_username: "gecko_enrich_token",
                telegram_handle: "geckoenrich",
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
            onchain: {
              mint: targetMint,
              uri: "https://example.com/metaplex-fast-follow.json",
            },
            offchain: {
              description: "metaplex secondary description",
              external_url: "https://example.com/metaplex-secondary",
              extensions: {
                twitter: "metaplex_secondary",
                telegram: "metaplexsecondary",
              },
            },
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
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.selectedIncompleteCount, 1);
      assert.equal(parsed.summary.skippedCompleteCount, 1);
      assert.equal(parsed.summary.notifyCandidateCount, 1);
      assert.equal(parsed.summary.notifyWouldSendCount, 1);
      assert.equal(parsed.summary.notifySentCount, 0);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.token.mint, targetMint);
      assert.equal(parsed.items[0]?.selectedReason, "Token.createdAt");
      assert.equal(parsed.items[0]?.rescorePreview?.scoreRank, "S");
      assert.equal(parsed.items[0]?.notifyCandidate, true);
      assert.equal(parsed.items[0]?.notifyEligibleBefore, false);
      assert.equal(parsed.items[0]?.notifyEligibleAfter, true);
      assert.equal(parsed.items[0]?.notifyWouldSend, true);
      assert.equal(parsed.items[0]?.notifySent, false);
      assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
    });
  });

  await t.test("matches notifyWouldSend parity between CLI dry-run and helper adapter", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "notify-parity.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const metaplexFixtureFile = join(dir, "metaplex.json");
      const newerCompleteMint = "GeckoNotifyParityComplete11111111111111111111";
      const targetMint = "GeckoNotifyParityTarget1111111111111111111111";
      const olderIncompleteMint = "GeckoNotifyParityOlder1111111111111111111111";
      const now = Date.now();
      const targetCreatedAt = new Date(now - 2 * 60_000);
      const geckoSnapshot = {
        data: {
          id: `solana_${targetMint}`,
          type: "token",
          attributes: {
            address: targetMint,
            name: "pokemon dog newinfo",
            symbol: "SMGET",
            description: "gecko enrich context description",
            websites: ["https://example.com/gecko-enrich"],
            twitter_username: "gecko_enrich_token",
            telegram_handle: "geckoenrich",
          },
        },
      };
      const metaplexFixture = {
        onchain: {
          mint: targetMint,
          uri: "https://example.com/metaplex-fast-follow.json",
        },
        offchain: {
          description: "metaplex secondary description",
          external_url: "https://example.com/metaplex-secondary",
          extensions: {
            twitter: "metaplex_secondary",
            telegram: "metaplexsecondary",
          },
        },
      };

      await runDbPush(databaseUrl);
      await seedBatchToken(databaseUrl, {
        mint: olderIncompleteMint,
        createdAt: new Date(now - 3 * 60_000),
      });
      await seedBatchToken(databaseUrl, {
        mint: targetMint,
        createdAt: targetCreatedAt,
      });
      await seedBatchToken(databaseUrl, {
        mint: newerCompleteMint,
        createdAt: new Date(now - 60_000),
        name: "Already Complete",
        symbol: "ALRDY",
        metadataStatus: "partial",
      });

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(geckoSnapshot, null, 2),
        "utf8",
      );
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(metaplexFixture, null, 2),
        "utf8",
      );

      const cliResult = await runTokenEnrichRescoreGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10"],
        {
          databaseUrl,
          geckoSnapshotFile,
          metaplexFixtureFile,
        },
      );
      assert.equal(cliResult.ok, true);

      const parsed = JSON.parse(
        cliResult.stdout,
      ) as TokenEnrichRescoreGeckoterminalOutput;
      const cliItem = parsed.items[0];
      assert.ok(cliItem);
      assert.equal(
        Object.prototype.hasOwnProperty.call(cliItem, "helperResult"),
        false,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(cliItem, "adapterItem"),
        false,
      );

      const existingToken: GeckoTokenWriteExistingToken = {
        mint: targetMint,
        name: null,
        symbol: null,
        description: null,
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        importedAt: targetCreatedAt.toISOString(),
        enrichedAt: null,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        reviewFlagsJson: null,
      };
      const helperResult = await runGeckoTokenWriteForMint(
        {
          mint: targetMint,
          write: false,
          existingToken,
        },
        {
          fetchTokenSnapshot: async () => geckoSnapshot,
          fetchMetaplexContext: async () => metaplexFixture,
        },
      );
      const adapterItem = toGeckoTokenEnrichRescoreCliItem({
        result: helperResult,
        selectedReason: "Token.createdAt",
        writeEnabled: false,
        token: cliItem.token as unknown as GeckoTokenEnrichRescoreCliToken,
      });

      assert.equal(cliItem.notifyCandidate, true);
      assert.equal(cliItem.notifyEligibleBefore, false);
      assert.equal(cliItem.notifyEligibleAfter, true);
      assert.equal(cliItem.notifyWouldSend, true);
      assert.equal(cliItem.notifySent, false);
      assert.equal(helperResult.notifyEligibleBefore, false);
      assert.equal(helperResult.notifyEligibleAfter, true);
      assert.equal(helperResult.notifyWouldSend, true);
      assert.equal(helperResult.notifySent, false);
      assert.equal(adapterItem.notifyCandidate, cliItem.notifyCandidate);
      assert.equal(
        adapterItem.notifyEligibleBefore,
        cliItem.notifyEligibleBefore,
      );
      assert.equal(adapterItem.notifyEligibleAfter, cliItem.notifyEligibleAfter);
      assert.equal(adapterItem.notifyWouldSend, cliItem.notifyWouldSend);
      assert.equal(adapterItem.notifySent, cliItem.notifySent);

      const token = await readToken(databaseUrl, targetMint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.rescoredAt, null);
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
