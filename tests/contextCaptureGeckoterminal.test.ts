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
const CONTEXT_SOURCE = "geckoterminal.token_snapshot";

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

type ContextCaptureGeckoterminalOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  source: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceHours: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    selectedCount: number;
    skippedAlreadyCapturedCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    errorCount: number;
    writeCount: number;
    savedContextBeforeCount: number;
    availableDescriptionCount: number;
    availableWebsiteCount: number;
    availableXCount: number;
    availableTelegramCount: number;
  };
  items: Array<{
    token: {
      id: number;
      mint: string;
      currentSource: string | null;
      originSource: string | null;
      metadataStatus: string;
      name: string | null;
      symbol: string | null;
      selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
      isGeckoterminalOrigin: boolean;
      hasUsefulSavedContextCapture: boolean;
    };
    selectedReason: "explicitMint" | "firstSeenSourceSnapshot.detectedAt" | "Token.createdAt";
    status: "ok" | "error";
    savedContextPresentBefore: boolean;
    collectedContext?: {
      source: string;
      metadataText: {
        name: string | null;
        symbol: string | null;
        description: string | null;
      };
      links: {
        website: string | null;
        x: string | null;
        telegram: string | null;
      };
    };
    wouldWrite: boolean;
    writeSummary: {
      dryRun: boolean;
      updatedEntrySnapshot: boolean;
    };
    error?: string;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-context-capture-gecko-test-"));

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

async function runContextCaptureGeckoterminal(
  args: string[],
  options?: {
    databaseUrl?: string;
    geckoSnapshotFile?: string;
  },
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `context-capture-gecko-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `context-capture-gecko-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/contextCaptureGeckoterminal.ts",
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
  options?: {
    entrySnapshot?: Record<string, unknown>;
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
        mint,
        source: GECKO_ORIGIN_SOURCE,
        ...(options?.entrySnapshot
          ? {
              entrySnapshot: options.entrySnapshot,
            }
          : {}),
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
  entrySnapshot: unknown;
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
        entrySnapshot: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("context:capture:geckoterminal supports deterministic single dry-run with fixture override", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-capture-single.db")}`;
    const geckoSnapshotFile = join(dir, "gecko-context-snapshot.json");
    const mint = "GeckoContextCaptureMint11111111111111111111pump";

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
              name: "context capture token",
              symbol: "CCT",
              description: "context capture description",
              websites: ["https://example.com/project"],
              twitter_username: "context_token",
              telegram_handle: "contexttelegram",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runContextCaptureGeckoterminal(
      ["--mint", mint],
      {
        databaseUrl,
        geckoSnapshotFile,
      },
    );

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCaptureGeckoterminalOutput;

    assert.equal(parsed.mode, "single");
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.writeEnabled, false);
    assert.equal(parsed.source, CONTEXT_SOURCE);
    assert.equal(parsed.selection.mint, mint);
    assert.equal(parsed.selection.limit, null);
    assert.equal(parsed.selection.sinceHours, null);
    assert.equal(parsed.selection.sinceCutoff, null);
    assert.equal(parsed.selection.pumpOnly, false);
    assert.equal(parsed.selection.selectedCount, 1);
    assert.equal(parsed.selection.skippedAlreadyCapturedCount, 0);
    assert.equal(parsed.selection.skippedNonPumpCount, 0);
    assert.equal(parsed.summary.selectedCount, 1);
    assert.equal(parsed.summary.okCount, 1);
    assert.equal(parsed.summary.errorCount, 0);
    assert.equal(parsed.summary.writeCount, 0);
    assert.equal(parsed.summary.savedContextBeforeCount, 0);
    assert.equal(parsed.summary.availableDescriptionCount, 1);
    assert.equal(parsed.summary.availableWebsiteCount, 1);
    assert.equal(parsed.summary.availableXCount, 1);
    assert.equal(parsed.summary.availableTelegramCount, 1);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.token.mint, mint);
    assert.equal(parsed.items[0]?.token.currentSource, GECKO_ORIGIN_SOURCE);
    assert.equal(parsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);
    assert.equal(parsed.items[0]?.token.isGeckoterminalOrigin, true);
    assert.equal(parsed.items[0]?.token.hasUsefulSavedContextCapture, false);
    assert.equal(parsed.items[0]?.selectedReason, "explicitMint");
    assert.equal(parsed.items[0]?.status, "ok");
    assert.equal(parsed.items[0]?.savedContextPresentBefore, false);
    assert.equal(parsed.items[0]?.wouldWrite, true);
    assert.equal(parsed.items[0]?.collectedContext?.source, CONTEXT_SOURCE);
    assert.equal(parsed.items[0]?.collectedContext?.metadataText.name, "context capture token");
    assert.equal(parsed.items[0]?.collectedContext?.metadataText.symbol, "CCT");
    assert.equal(
      parsed.items[0]?.collectedContext?.metadataText.description,
      "context capture description",
    );
    assert.equal(
      parsed.items[0]?.collectedContext?.links.website,
      "https://example.com/project",
    );
    assert.equal(parsed.items[0]?.collectedContext?.links.x, "https://x.com/context_token");
    assert.equal(parsed.items[0]?.collectedContext?.links.telegram, "https://t.me/contexttelegram");
    assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
    assert.equal(parsed.items[0]?.writeSummary.updatedEntrySnapshot, false);

    const token = await readToken(databaseUrl, mint);
    assert.ok(token);
    const entrySnapshot =
      token.entrySnapshot &&
      typeof token.entrySnapshot === "object" &&
      !Array.isArray(token.entrySnapshot)
        ? (token.entrySnapshot as Record<string, unknown>)
        : null;
    assert.equal(entrySnapshot?.contextCapture, undefined);
  });
});

test("context:capture:geckoterminal rejects unknown args", async () => {
  const result = await runContextCaptureGeckoterminal(["--source", "unexpected"]);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.notEqual(result.code, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.match(result.stderr, /Unknown arg: --source/);
});

test("context:capture:geckoterminal keeps write mode as a no-op when collected context matches saved context", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-capture-write-noop.db")}`;
    const geckoSnapshotFile = join(dir, "gecko-context-write-noop.json");
    const mint = "GeckoContextCaptureNoop111111111111111111111pump";

    await runDbPush(databaseUrl);
    await seedToken(databaseUrl, mint, {
      entrySnapshot: {
        contextCapture: {
          geckoterminalTokenSnapshot: {
            source: CONTEXT_SOURCE,
            capturedAt: new Date(0).toISOString(),
            address: mint,
            metadataText: {
              name: "context noop token",
              symbol: "CNOOP",
              description: "context noop description",
            },
            links: {
              website: "https://example.com/context-noop",
              x: "https://x.com/context_noop",
              telegram: "https://t.me/contextnoop",
              websites: ["https://example.com/context-noop"],
              xCandidates: ["https://x.com/context_noop"],
              telegramCandidates: ["https://t.me/contextnoop"],
              otherLinks: [],
            },
            availableFields: [
              "metadata.name",
              "metadata.symbol",
              "metadata.description",
              "links.website",
              "links.x",
              "links.telegram",
            ],
            missingFields: ["links.other"],
          },
        },
      },
    });

    await writeFile(
      geckoSnapshotFile,
      JSON.stringify(
        {
          data: {
            id: `solana_${mint}`,
            type: "token",
            attributes: {
              address: mint,
              name: "context noop token",
              symbol: "CNOOP",
              description: "context noop description",
              websites: ["https://example.com/context-noop"],
              twitter_username: "context_noop",
              telegram_handle: "contextnoop",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runContextCaptureGeckoterminal(
      ["--mint", mint, "--write"],
      {
        databaseUrl,
        geckoSnapshotFile,
      },
    );

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCaptureGeckoterminalOutput;

    assert.equal(parsed.mode, "single");
    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.writeEnabled, true);
    assert.equal(parsed.selection.mint, mint);
    assert.equal(parsed.summary.selectedCount, 1);
    assert.equal(parsed.summary.writeCount, 0);
    assert.equal(parsed.summary.savedContextBeforeCount, 1);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.token.mint, mint);
    assert.equal(parsed.items[0]?.token.hasUsefulSavedContextCapture, true);
    assert.equal(parsed.items[0]?.savedContextPresentBefore, true);
    assert.equal(parsed.items[0]?.status, "ok");
    assert.equal(parsed.items[0]?.wouldWrite, false);
    assert.equal(parsed.items[0]?.writeSummary.dryRun, false);
    assert.equal(parsed.items[0]?.writeSummary.updatedEntrySnapshot, false);
  });
});

test("context:capture:geckoterminal writes useful single-mint context with --write", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-capture-write-success.db")}`;
    const geckoSnapshotFile = join(dir, "gecko-context-write-success.json");
    const mint = "GeckoContextCaptureWrite111111111111111111111pump";

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
              name: "context write token",
              symbol: "CWRITE",
              description: "context write description",
              websites: ["https://example.com/context-write"],
              twitter_username: "context_write",
              telegram_handle: "contextwrite",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runContextCaptureGeckoterminal(
      ["--mint", mint, "--write"],
      {
        databaseUrl,
        geckoSnapshotFile,
      },
    );

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCaptureGeckoterminalOutput;

    assert.equal(parsed.mode, "single");
    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.writeEnabled, true);
    assert.equal(parsed.selection.mint, mint);
    assert.equal(parsed.summary.selectedCount, 1);
    assert.equal(parsed.summary.writeCount, 1);
    assert.equal(parsed.summary.savedContextBeforeCount, 0);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.token.mint, mint);
    assert.equal(parsed.items[0]?.token.hasUsefulSavedContextCapture, false);
    assert.equal(parsed.items[0]?.savedContextPresentBefore, false);
    assert.equal(parsed.items[0]?.status, "ok");
    assert.equal(parsed.items[0]?.wouldWrite, true);
    assert.equal(parsed.items[0]?.writeSummary.dryRun, false);
    assert.equal(parsed.items[0]?.writeSummary.updatedEntrySnapshot, true);

    const token = await readToken(databaseUrl, mint);
    assert.ok(token);
    const entrySnapshot =
      token.entrySnapshot &&
      typeof token.entrySnapshot === "object" &&
      !Array.isArray(token.entrySnapshot)
        ? (token.entrySnapshot as Record<string, unknown>)
        : null;
    const contextCapture =
      entrySnapshot?.contextCapture &&
      typeof entrySnapshot.contextCapture === "object" &&
      !Array.isArray(entrySnapshot.contextCapture)
        ? (entrySnapshot.contextCapture as Record<string, unknown>)
        : null;
    const geckoSnapshot =
      contextCapture?.geckoterminalTokenSnapshot &&
      typeof contextCapture.geckoterminalTokenSnapshot === "object" &&
      !Array.isArray(contextCapture.geckoterminalTokenSnapshot)
        ? (contextCapture.geckoterminalTokenSnapshot as Record<string, unknown>)
        : null;
    const metadataText =
      geckoSnapshot?.metadataText &&
      typeof geckoSnapshot.metadataText === "object" &&
      !Array.isArray(geckoSnapshot.metadataText)
        ? (geckoSnapshot.metadataText as Record<string, unknown>)
        : null;
    const links =
      geckoSnapshot?.links &&
      typeof geckoSnapshot.links === "object" &&
      !Array.isArray(geckoSnapshot.links)
        ? (geckoSnapshot.links as Record<string, unknown>)
        : null;

    assert.equal(geckoSnapshot?.source, CONTEXT_SOURCE);
    assert.equal(geckoSnapshot?.address, mint);
    assert.equal(typeof geckoSnapshot?.capturedAt, "string");
    assert.equal(metadataText?.name, "context write token");
    assert.equal(metadataText?.symbol, "CWRITE");
    assert.equal(metadataText?.description, "context write description");
    assert.equal(links?.website, "https://example.com/context-write");
    assert.equal(links?.x, "https://x.com/context_write");
    assert.equal(links?.telegram, "https://t.me/contextwrite");
  });
});

test("context:capture:geckoterminal accounts for already-captured and non-pump skips in recent batches", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-capture-skip-accounting.db")}`;
    const geckoSnapshotFile = join(dir, "gecko-context-skip-accounting.json");
    const selectedMint = "GeckoContextCaptureSelected111111111111111111pump";
    const alreadyCapturedPumpMint = "GeckoContextCaptureSaved11111111111111111111pump";
    const nonPumpMint = "GeckoContextCaptureNonPump1111111111111111111111";

    await runDbPush(databaseUrl);
    await seedToken(databaseUrl, selectedMint);
    await seedToken(databaseUrl, alreadyCapturedPumpMint, {
      entrySnapshot: {
        contextCapture: {
          geckoterminalTokenSnapshot: {
            source: CONTEXT_SOURCE,
            capturedAt: new Date().toISOString(),
            address: alreadyCapturedPumpMint,
            metadataText: {
              name: "saved token",
              symbol: "SVD",
              description: null,
            },
            links: {
              website: "https://example.com/saved",
              x: null,
              telegram: null,
              websites: ["https://example.com/saved"],
              xCandidates: [],
              telegramCandidates: [],
              otherLinks: [],
            },
            availableFields: ["metadata.name", "metadata.symbol", "links.website"],
            missingFields: ["metadata.description", "links.x", "links.telegram", "links.other"],
          },
        },
      },
    });
    await seedToken(databaseUrl, nonPumpMint);

    await writeFile(
      geckoSnapshotFile,
      JSON.stringify(
        {
          data: {
            id: `solana_${selectedMint}`,
            type: "token",
            attributes: {
              address: selectedMint,
              name: "batch capture token",
              symbol: "BCT",
              description: "batch capture description",
              telegram_handle: "batchcapture",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runContextCaptureGeckoterminal(
      ["--limit", "5", "--sinceHours", "1"],
      {
        databaseUrl,
        geckoSnapshotFile,
      },
    );

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCaptureGeckoterminalOutput;

    assert.equal(parsed.mode, "recent_batch");
    assert.equal(parsed.selection.pumpOnly, true);
    assert.equal(parsed.selection.selectedCount, 1);
    assert.equal(parsed.selection.skippedAlreadyCapturedCount, 1);
    assert.equal(parsed.selection.skippedNonPumpCount, 1);
    assert.equal(parsed.summary.selectedCount, 1);
    assert.equal(parsed.summary.savedContextBeforeCount, 0);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.token.mint, selectedMint);
    assert.equal(parsed.items[0]?.token.hasUsefulSavedContextCapture, false);
    assert.equal(parsed.items[0]?.savedContextPresentBefore, false);
    assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
    assert.equal(parsed.items[0]?.writeSummary.updatedEntrySnapshot, false);
  });
});

test("context:capture:geckoterminal returns empty recent batch when no matching gecko tokens exist", async () => {
  await withTempDir(async (dir) => {
    const databaseUrl = `file:${join(dir, "context-capture-empty.db")}`;

    await runDbPush(databaseUrl);

    const result = await runContextCaptureGeckoterminal(["--limit", "5", "--sinceHours", "1"], {
      databaseUrl,
    });

    assert.equal(result.ok, true, result.stderr);
    if (!result.ok) return;

    const parsed = JSON.parse(result.stdout) as ContextCaptureGeckoterminalOutput;

    assert.equal(parsed.mode, "recent_batch");
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.writeEnabled, false);
    assert.equal(parsed.source, CONTEXT_SOURCE);
    assert.equal(parsed.selection.mint, null);
    assert.equal(parsed.selection.limit, 5);
    assert.equal(parsed.selection.sinceHours, 1);
    assert.equal(typeof parsed.selection.sinceCutoff, "string");
    assert.equal(parsed.selection.pumpOnly, true);
    assert.equal(parsed.selection.selectedCount, 0);
    assert.equal(parsed.selection.skippedAlreadyCapturedCount, 0);
    assert.equal(parsed.selection.skippedNonPumpCount, 0);
    assert.equal(parsed.summary.selectedCount, 0);
    assert.equal(parsed.summary.okCount, 0);
    assert.equal(parsed.summary.errorCount, 0);
    assert.equal(parsed.summary.writeCount, 0);
    assert.equal(parsed.summary.savedContextBeforeCount, 0);
    assert.equal(parsed.summary.availableDescriptionCount, 0);
    assert.equal(parsed.summary.availableWebsiteCount, 0);
    assert.equal(parsed.summary.availableXCount, 0);
    assert.equal(parsed.summary.availableTelegramCount, 0);
    assert.deepEqual(parsed.items, []);
  });
});
