import "dotenv/config";

import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { db } from "./db.js";

const execFileAsync = promisify(execFile);
const TREND_PATH = "data/trend.json";

type CommandResult = {
  stdout: string;
  stderr: string;
};

type SmokeContext = {
  smokeId: string;
  basicMint: string;
  mintOnlyMint: string;
  mintBatchMints: [string, string];
  mintBatchDuplicateMint: string;
  mintBatchRerunMints: [string, string];
  mintSourceEventMint: string;
  detectRunnerMint: string;
  geckoterminalDetectRunnerMint: string;
  geckoterminalDetectRunnerCheckpointMint: string;
  detectRunnerCheckpointMint: string;
  detectRunnerIdleLogMint: string;
  mintHappyPathMint: string;
  minMint: string;
  fileMint: string;
  metricMint: string;
  metricSnapshotMint: string;
  metricSnapshotGapMint: string;
  metricSnapshotRateLimitMints: [string, string];
  geckoEnrichRescoreMint: string;
  metricId: number | null;
  devWallet: string;
  trendRaw: string;
  trendGeneratedAt: string;
  fileImportPath: string;
  mintBatchFilePath: string;
  mintBatchDuplicateFilePath: string;
  mintBatchRerunFilePath: string;
  mintSourceEventFilePath: string;
  detectRunnerFilePath: string;
  geckoterminalDetectRunnerFilePath: string;
  geckoterminalDetectRunnerCheckpointFilePath: string;
  geckoterminalDetectRunnerCheckpointPath: string;
  geckoterminalDetectRunnerInvalidFilePath: string;
  geckoterminalDetectRunnerInvalidCheckpointPath: string;
  detectRunnerCheckpointFilePath: string;
  detectRunnerCheckpointPath: string;
  detectRunnerIdleLogFilePath: string;
  detectRunnerIdleLogCheckpointPath: string;
  detectRunnerInvalidFilePath: string;
  detectRunnerInvalidCheckpointPath: string;
  mintHappyPathFilePath: string;
  metricSnapshotFilePath: string;
  geckoEnrichRescoreFilePath: string;
};

function logStep(message: string): void {
  console.log(`[smoke] ${message}`);
}

async function runCommand(
  step: string,
  command: string,
  args: string[],
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      env: process.env,
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const details =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? "").trim()
        : error instanceof Error
          ? error.message
          : String(error);

    throw new Error(`${step} failed: ${details}`);
  }
}

async function runStep(name: string, fn: () => Promise<void>): Promise<void> {
  logStep(`start: ${name}`);
  await fn();
  logStep(`ok: ${name}`);
}

function parseJson<T>(step: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `${step} returned non-JSON output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runCliJson<T>(
  step: string,
  scriptPath: string,
  args: string[],
  smokeId: string,
): Promise<T> {
  const outputPath = `/tmp/${smokeId}-${step.replace(/\s+/g, "-")}.json`;
  const command = [
    "node",
    "--import",
    "tsx",
    scriptPath,
    ...args,
  ]
    .map(shellEscape)
    .join(" ");

  try {
    await runCommand(step, "bash", [
      "-lc",
      `${command} > ${shellEscape(outputPath)}`,
    ]);

    const raw = await readFile(outputPath, "utf-8");
    return parseJson<T>(step, raw);
  } finally {
    await rm(outputPath, { force: true });
  }
}

async function runCliJsonWithStderr<T>(
  step: string,
  scriptPath: string,
  args: string[],
  smokeId: string,
): Promise<{ parsed: T; stderr: string }> {
  const outputPath = `/tmp/${smokeId}-${step.replace(/\s+/g, "-")}.stdout.json`;
  const stderrPath = `/tmp/${smokeId}-${step.replace(/\s+/g, "-")}.stderr.log`;
  const command = [
    "node",
    "--import",
    "tsx",
    scriptPath,
    ...args,
  ]
    .map(shellEscape)
    .join(" ");

  try {
    await runCommand(step, "bash", [
      "-lc",
      `${command} > ${shellEscape(outputPath)} 2> ${shellEscape(stderrPath)}`,
    ]);

    const [raw, stderr] = await Promise.all([
      readFile(outputPath, "utf-8"),
      readFile(stderrPath, "utf-8"),
    ]);

    return {
      parsed: parseJson<T>(step, raw),
      stderr: stderr.trim(),
    };
  } finally {
    await rm(outputPath, { force: true });
    await rm(stderrPath, { force: true });
  }
}

async function runCliFailure(
  step: string,
  scriptPath: string,
  args: string[],
): Promise<CommandResult> {
  try {
    await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      scriptPath,
      ...args,
    ], {
      cwd: process.cwd(),
      env: process.env,
    });
  } catch (error) {
    const output = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };

    return {
      stdout: String(output.stdout ?? "").trim(),
      stderr:
        String(output.stderr ?? "").trim() ||
        (error instanceof Error ? error.message : String(error)),
    };
  }

  throw new Error(`${step} unexpectedly succeeded`);
}

async function cleanup(context: SmokeContext): Promise<void> {
  const tokens = await db.token.findMany({
    where: {
      mint: {
        in: [
          context.basicMint,
          context.mintOnlyMint,
          ...context.mintBatchMints,
          context.mintBatchDuplicateMint,
          ...context.mintBatchRerunMints,
          context.mintSourceEventMint,
          context.detectRunnerMint,
          context.geckoterminalDetectRunnerMint,
          context.geckoterminalDetectRunnerCheckpointMint,
          context.detectRunnerCheckpointMint,
          context.detectRunnerIdleLogMint,
          context.mintHappyPathMint,
          context.minMint,
          context.fileMint,
          context.metricMint,
          context.metricSnapshotMint,
          context.metricSnapshotGapMint,
          ...context.metricSnapshotRateLimitMints,
          context.geckoEnrichRescoreMint,
        ],
      },
    },
    select: {
      id: true,
    },
  });

  const tokenIds = tokens.map((token) => token.id);
  if (tokenIds.length > 0) {
    await db.metric.deleteMany({
      where: {
        tokenId: {
          in: tokenIds,
        },
      },
    });
  }

  await db.token.deleteMany({
    where: {
      mint: {
        in: [
          context.basicMint,
          context.mintOnlyMint,
          ...context.mintBatchMints,
          context.mintBatchDuplicateMint,
          ...context.mintBatchRerunMints,
          context.mintSourceEventMint,
          context.detectRunnerMint,
          context.detectRunnerCheckpointMint,
          context.detectRunnerIdleLogMint,
          context.mintHappyPathMint,
          context.minMint,
          context.fileMint,
          context.metricMint,
          context.metricSnapshotMint,
          context.metricSnapshotGapMint,
          ...context.metricSnapshotRateLimitMints,
          context.geckoEnrichRescoreMint,
        ],
      },
    },
  });

  await db.dev.deleteMany({
    where: {
      wallet: context.devWallet,
    },
  });

  await rm(context.fileImportPath, { force: true });
  await rm(context.mintBatchFilePath, { force: true });
  await rm(context.mintBatchDuplicateFilePath, { force: true });
  await rm(context.mintBatchRerunFilePath, { force: true });
  await rm(context.mintSourceEventFilePath, { force: true });
  await rm(context.detectRunnerFilePath, { force: true });
  await rm(context.detectRunnerCheckpointFilePath, { force: true });
  await rm(context.detectRunnerCheckpointPath, { force: true });
  await rm(context.detectRunnerIdleLogFilePath, { force: true });
  await rm(context.detectRunnerIdleLogCheckpointPath, { force: true });
  await rm(context.detectRunnerInvalidFilePath, { force: true });
  await rm(context.detectRunnerInvalidCheckpointPath, { force: true });
  await rm(context.mintHappyPathFilePath, { force: true });
  await rm(context.metricSnapshotFilePath, { force: true });
  await rm(context.geckoEnrichRescoreFilePath, { force: true });
}

async function restoreTrend(trendRaw: string): Promise<void> {
  await writeFile(TREND_PATH, trendRaw, "utf-8");
}

async function run(): Promise<void> {
  const smokeId = `SMOKE_${Date.now()}`;
  const context: SmokeContext = {
    smokeId,
    basicMint: `${smokeId}_BASIC`,
    mintOnlyMint: `${smokeId}_MINTONLY`,
    mintBatchMints: [
      `${smokeId}_MINTBATCH1`,
      `${smokeId}_MINTBATCH2`,
    ],
    mintBatchDuplicateMint: `${smokeId}_MINTBATCH_DUP`,
    mintBatchRerunMints: [
      `${smokeId}_MINTBATCH_RERUN1`,
      `${smokeId}_MINTBATCH_RERUN2`,
    ],
    mintSourceEventMint: `${smokeId}_SOURCE_EVENT`,
    detectRunnerMint: `H${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "2").padEnd(43, "3").slice(0, 43)}`,
    geckoterminalDetectRunnerMint: `L${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "5").padEnd(43, "6").slice(0, 43)}`,
    geckoterminalDetectRunnerCheckpointMint: `M${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "6").padEnd(43, "7").slice(0, 43)}`,
    detectRunnerCheckpointMint: `J${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "3").padEnd(43, "4").slice(0, 43)}`,
    detectRunnerIdleLogMint: `K${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "4").padEnd(43, "5").slice(0, 43)}`,
    mintHappyPathMint: `${smokeId}_HAPPY_PATH`,
    minMint: `${smokeId}_MIN`,
    fileMint: `${smokeId}_FILE`,
    metricMint: `${smokeId}_METRIC`,
    metricSnapshotMint: `${smokeId}_METRIC_SNAPSHOT`,
    metricSnapshotGapMint: `${smokeId}_METRIC_SNAPSHOT_GAP`,
    metricSnapshotRateLimitMints: [
      `${smokeId}_METRIC_SNAPSHOT_RATE_LIMIT_1`,
      `${smokeId}_METRIC_SNAPSHOT_RATE_LIMIT_2`,
    ],
    geckoEnrichRescoreMint: `${smokeId}_GECKO_ENRICH_RESCORE`,
    metricId: null,
    devWallet: `${smokeId}_DEV`,
    trendRaw: await readFile(TREND_PATH, "utf-8"),
    trendGeneratedAt: "",
    fileImportPath: `/tmp/${smokeId}-import-file.json`,
    mintBatchFilePath: `/tmp/${smokeId}-import-mint-file.json`,
    mintBatchDuplicateFilePath: `/tmp/${smokeId}-import-mint-file-duplicate.json`,
    mintBatchRerunFilePath: `/tmp/${smokeId}-import-mint-file-rerun.json`,
    mintSourceEventFilePath: `/tmp/${smokeId}-import-mint-source-file.json`,
    detectRunnerFilePath: `/tmp/${smokeId}-detect-dexscreener-file.json`,
    geckoterminalDetectRunnerFilePath: `/tmp/${smokeId}-detect-geckoterminal-file.json`,
    geckoterminalDetectRunnerCheckpointFilePath: `/tmp/${smokeId}-detect-geckoterminal-checkpoint-file.json`,
    geckoterminalDetectRunnerCheckpointPath: `/tmp/${smokeId}-detect-geckoterminal-checkpoint.json`,
    geckoterminalDetectRunnerInvalidFilePath: `/tmp/${smokeId}-detect-geckoterminal-invalid-file.json`,
    geckoterminalDetectRunnerInvalidCheckpointPath: `/tmp/${smokeId}-detect-geckoterminal-invalid-checkpoint.json`,
    detectRunnerCheckpointFilePath: `/tmp/${smokeId}-detect-dexscreener-checkpoint-file.json`,
    detectRunnerCheckpointPath: `/tmp/${smokeId}-detect-dexscreener-checkpoint.json`,
    detectRunnerIdleLogFilePath: `/tmp/${smokeId}-detect-dexscreener-idle-log-file.json`,
    detectRunnerIdleLogCheckpointPath: `/tmp/${smokeId}-detect-dexscreener-idle-log-checkpoint.json`,
    detectRunnerInvalidFilePath: `/tmp/${smokeId}-detect-dexscreener-invalid-file.json`,
    detectRunnerInvalidCheckpointPath: `/tmp/${smokeId}-detect-dexscreener-invalid-checkpoint.json`,
    mintHappyPathFilePath: `/tmp/${smokeId}-mint-happy-path-source-file.json`,
    metricSnapshotFilePath: `/tmp/${smokeId}-metric-snapshot.json`,
    geckoEnrichRescoreFilePath: `/tmp/${smokeId}-gecko-enrich-rescore.json`,
  };

  try {
    context.trendGeneratedAt = JSON.parse(context.trendRaw).generatedAt as string;

    await runStep("tsc", async () => {
      await runCommand("tsc", process.execPath, [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
      ]);
    });

    await runStep("basic import", async () => {
      const parsed = await runCliJson<{ mint: string }>(
        "basic import",
        "src/cli/import.ts",
        [
          "--mint",
          context.basicMint,
          "--name",
          "smoke token basic",
          "--symbol",
          "SMKB",
          "--source",
          "smoke-test",
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.basicMint) {
        throw new Error("basic import returned unexpected mint");
      }

      const token = await db.token.findUnique({
        where: { mint: context.basicMint },
      });
      if (!token) {
        throw new Error("basic import token was not saved");
      }
    });

    await runStep("mint-only rerun", async () => {
      const first = await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "mint-only first import",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.mintOnlyMint,
          "--source",
          "smoke-test",
        ],
        context.smokeId,
      );

      if (first.mint !== context.mintOnlyMint) {
        throw new Error("mint-only first import returned unexpected mint");
      }

      if (first.created !== true) {
        throw new Error("mint-only first import did not create the token");
      }

      const second = await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "mint-only rerun",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.mintOnlyMint,
          "--source",
          "smoke-test",
        ],
        context.smokeId,
      );

      if (second.mint !== context.mintOnlyMint) {
        throw new Error("mint-only rerun returned unexpected mint");
      }

      if (second.created !== false) {
        throw new Error("mint-only rerun did not return created=false");
      }
    });

    await runStep("mint-only batch file import", async () => {
      await writeFile(
        context.mintBatchFilePath,
        `${JSON.stringify(
          {
            items: context.mintBatchMints.map((mint) => ({
              mint,
              source: "smoke-test",
            })),
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const parsed = await runCliJson<{
        count: number;
        createdCount: number;
        existingCount: number;
        items: Array<{
          mint: string;
          metadataStatus: string;
          created: boolean;
          requestedSource: string | null;
        }>;
      }>(
        "mint-only batch file import",
        "src/cli/importMintFile.ts",
        [
          "--file",
          context.mintBatchFilePath,
        ],
        context.smokeId,
      );

      if (parsed.count !== 2) {
        throw new Error("mint-only batch file import returned unexpected count");
      }

      if (parsed.createdCount !== 2 || parsed.existingCount !== 0) {
        throw new Error("mint-only batch file import returned unexpected summary");
      }

      for (const mint of context.mintBatchMints) {
        const item = parsed.items.find((entry) => entry.mint === mint);
        if (!item) {
          throw new Error("mint-only batch file import summary missed an item");
        }

        if (item.metadataStatus !== "mint_only") {
          throw new Error("mint-only batch file import returned unexpected metadataStatus");
        }

        if (item.created !== true || item.requestedSource !== "smoke-test") {
          throw new Error("mint-only batch file import returned unexpected item summary");
        }
      }

      const tokens = await db.token.findMany({
        where: {
          mint: {
            in: context.mintBatchMints,
          },
        },
        select: {
          mint: true,
          source: true,
          metadataStatus: true,
        },
      });

      if (tokens.length !== 2) {
        throw new Error("mint-only batch file import did not save both tokens");
      }

      for (const token of tokens) {
        if (token.source !== "smoke-test") {
          throw new Error("mint-only batch file import did not persist source");
        }

        if (token.metadataStatus !== "mint_only") {
          throw new Error("mint-only batch file import did not persist mint_only status");
        }
      }
    });

    await runStep("mint-only batch file duplicate mint", async () => {
      await writeFile(
        context.mintBatchDuplicateFilePath,
        `${JSON.stringify(
          {
            items: [
              {
                mint: context.mintBatchDuplicateMint,
                source: "smoke-test",
              },
              {
                mint: context.mintBatchDuplicateMint,
                source: "smoke-test",
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const parsed = await runCliJson<{
        count: number;
        createdCount: number;
        existingCount: number;
        items: Array<{
          mint: string;
          metadataStatus: string;
          created: boolean;
          requestedSource: string | null;
        }>;
      }>(
        "mint-only batch file duplicate mint",
        "src/cli/importMintFile.ts",
        [
          "--file",
          context.mintBatchDuplicateFilePath,
        ],
        context.smokeId,
      );

      if (parsed.count !== 2) {
        throw new Error("mint-only batch duplicate returned unexpected count");
      }

      if (parsed.createdCount !== 1 || parsed.existingCount !== 1) {
        throw new Error("mint-only batch duplicate returned unexpected summary");
      }

      if (parsed.items.length !== 2) {
        throw new Error("mint-only batch duplicate returned unexpected item count");
      }

      const [first, second] = parsed.items;

      if (
        first.mint !== context.mintBatchDuplicateMint ||
        first.metadataStatus !== "mint_only" ||
        first.created !== true ||
        first.requestedSource !== "smoke-test"
      ) {
        throw new Error("mint-only batch duplicate first item was unexpected");
      }

      if (
        second.mint !== context.mintBatchDuplicateMint ||
        second.metadataStatus !== "mint_only" ||
        second.created !== false ||
        second.requestedSource !== "smoke-test"
      ) {
        throw new Error("mint-only batch duplicate second item was unexpected");
      }
    });

    await runStep("mint-only batch file rerun", async () => {
      await writeFile(
        context.mintBatchRerunFilePath,
        `${JSON.stringify(
          {
            items: context.mintBatchRerunMints.map((mint) => ({
              mint,
              source: "smoke-test",
            })),
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const first = await runCliJson<{
        count: number;
        createdCount: number;
        existingCount: number;
      }>(
        "mint-only batch file rerun first pass",
        "src/cli/importMintFile.ts",
        [
          "--file",
          context.mintBatchRerunFilePath,
        ],
        context.smokeId,
      );

      if (first.count !== 2 || first.createdCount !== 2 || first.existingCount !== 0) {
        throw new Error("mint-only batch rerun first pass returned unexpected summary");
      }

      const second = await runCliJson<{
        count: number;
        createdCount: number;
        existingCount: number;
        items: Array<{
          mint: string;
          metadataStatus: string;
          created: boolean;
          requestedSource: string | null;
        }>;
      }>(
        "mint-only batch file rerun second pass",
        "src/cli/importMintFile.ts",
        [
          "--file",
          context.mintBatchRerunFilePath,
        ],
        context.smokeId,
      );

      if (second.count !== 2 || second.createdCount !== 0 || second.existingCount !== 2) {
        throw new Error("mint-only batch rerun second pass returned unexpected summary");
      }

      for (const item of second.items) {
        if (!context.mintBatchRerunMints.includes(item.mint)) {
          throw new Error("mint-only batch rerun returned unexpected mint");
        }

        if (
          item.metadataStatus !== "mint_only" ||
          item.created !== false ||
          item.requestedSource !== "smoke-test"
        ) {
          throw new Error("mint-only batch rerun returned unexpected item summary");
        }
      }
    });

    await runStep("mint-only source event file import", async () => {
      await writeFile(
        context.mintSourceEventFilePath,
        `${JSON.stringify(
          {
            source: "smoke-test-source-event",
            eventType: "token_detected",
            detectedAt: "2026-04-13T00:00:00.000Z",
            payload: {
              mintAddress: context.mintSourceEventMint,
              symbolHint: "SMKS",
              nameHint: "smoke source event",
              channelMessageId: "smoke-source-event-1",
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const parsed = await runCliJson<{
        handoffPayload: {
          mint: string;
          source: string;
        };
        result: {
          mint: string;
          metadataStatus: string;
          created: boolean;
        };
      }>(
        "mint-only source event file import",
        "src/cli/importMintSourceFile.ts",
        [
          "--file",
          context.mintSourceEventFilePath,
        ],
        context.smokeId,
      );

      if (parsed.handoffPayload.mint !== context.mintSourceEventMint) {
        throw new Error("mint-only source event handoff returned unexpected mint");
      }

      if (parsed.handoffPayload.source !== "smoke-test-source-event") {
        throw new Error("mint-only source event handoff returned unexpected source");
      }

      if (
        parsed.result.mint !== context.mintSourceEventMint ||
        parsed.result.metadataStatus !== "mint_only" ||
        parsed.result.created !== true
      ) {
        throw new Error("mint-only source event import returned unexpected result");
      }

      const token = await db.token.findUnique({
        where: { mint: context.mintSourceEventMint },
        select: {
          mint: true,
          source: true,
          metadataStatus: true,
        },
      });

      if (!token) {
        throw new Error("mint-only source event import did not save the token");
      }

      if (token.source !== "smoke-test-source-event") {
        throw new Error("mint-only source event import did not persist source");
      }

      if (token.metadataStatus !== "mint_only") {
        throw new Error("mint-only source event import did not persist mint_only status");
      }

      const rerun = await runCliJson<{
        handoffPayload: {
          mint: string;
          source: string;
        };
        result: {
          mint: string;
          metadataStatus: string;
          created: boolean;
        };
      }>(
        "mint-only source event file rerun",
        "src/cli/importMintSourceFile.ts",
        [
          "--file",
          context.mintSourceEventFilePath,
        ],
        context.smokeId,
      );

      if (
        rerun.handoffPayload.mint !== context.mintSourceEventMint ||
        rerun.handoffPayload.source !== "smoke-test-source-event"
      ) {
        throw new Error("mint-only source event rerun returned unexpected handoff payload");
      }

      if (
        rerun.result.mint !== context.mintSourceEventMint ||
        rerun.result.metadataStatus !== "mint_only" ||
        rerun.result.created !== false
      ) {
        throw new Error("mint-only source event rerun did not return created=false");
      }
    });

    await runStep("detect dexscreener dry-run and write", async () => {
      await writeFile(
        context.detectRunnerFilePath,
        `${JSON.stringify(
          {
            source: "dexscreener-token-profiles-latest-v1",
            eventType: "token_detected",
            detectedAt: "2026-04-16T13:35:37.123Z",
            payload: {
              mintAddress: context.detectRunnerMint,
              chainId: "solana",
              tokenAddress: context.detectRunnerMint,
              url: "https://dexscreener.com/solana/smoke-detect-runner",
              updatedAt: "2026-04-16T13:35:37.123Z",
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const dryRun = await runCliJson<{
        dryRun: boolean;
        writeEnabled: boolean;
        processedCount: number;
        acceptedCount: number;
        rejectedCount: number;
        importedCount: number;
        existingCount: number;
        items: Array<{
          handoffPayload?: {
            mint: string;
            source?: string;
          };
          detectorResult: {
            ok: boolean;
            mint?: string;
            source?: string;
          };
          importResult?: {
            created: boolean;
          };
        }>;
      }>(
        "detect dexscreener dry-run",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerFilePath,
        ],
        context.smokeId,
      );

      if (
        dryRun.dryRun !== true ||
        dryRun.writeEnabled !== false ||
        dryRun.processedCount !== 1 ||
        dryRun.acceptedCount !== 1 ||
        dryRun.rejectedCount !== 0 ||
        dryRun.importedCount !== 0 ||
        dryRun.existingCount !== 0 ||
        dryRun.items.length !== 1
      ) {
        throw new Error("detect dexscreener dry-run returned unexpected summary");
      }

      if (
        dryRun.items[0].handoffPayload?.mint !== context.detectRunnerMint ||
        dryRun.items[0].handoffPayload?.source !== "dexscreener-token-profiles-latest-v1" ||
        dryRun.items[0].detectorResult.ok !== true ||
        dryRun.items[0].detectorResult.mint !== context.detectRunnerMint ||
        dryRun.items[0].importResult !== undefined
      ) {
        throw new Error("detect dexscreener dry-run returned unexpected item fields");
      }

      const tokenBeforeWrite = await db.token.findUnique({
        where: { mint: context.detectRunnerMint },
        select: { id: true },
      });

      if (tokenBeforeWrite) {
        throw new Error("detect dexscreener dry-run unexpectedly wrote a token");
      }

      const written = await runCliJson<{
        dryRun: boolean;
        writeEnabled: boolean;
        processedCount: number;
        acceptedCount: number;
        rejectedCount: number;
        importedCount: number;
        existingCount: number;
        items: Array<{
          handoffPayload?: {
            mint: string;
            source?: string;
          };
          importResult?: {
            mint: string;
            metadataStatus: string;
            created: boolean;
          };
        }>;
      }>(
        "detect dexscreener write",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerFilePath,
          "--write",
        ],
        context.smokeId,
      );

      if (
        written.dryRun !== false ||
        written.writeEnabled !== true ||
        written.processedCount !== 1 ||
        written.acceptedCount !== 1 ||
        written.rejectedCount !== 0 ||
        written.importedCount !== 1 ||
        written.existingCount !== 0 ||
        written.items.length !== 1
      ) {
        throw new Error("detect dexscreener write returned unexpected summary");
      }

      if (
        written.items[0].handoffPayload?.mint !== context.detectRunnerMint ||
        written.items[0].importResult?.mint !== context.detectRunnerMint ||
        written.items[0].importResult?.metadataStatus !== "mint_only" ||
        written.items[0].importResult?.created !== true
      ) {
        throw new Error("detect dexscreener write returned unexpected item fields");
      }

      const writtenToken = await db.token.findUnique({
        where: { mint: context.detectRunnerMint },
        select: {
          mint: true,
          source: true,
          metadataStatus: true,
        },
      });

      if (!writtenToken) {
        throw new Error("detect dexscreener write did not create a token");
      }

      if (
        writtenToken.source !== "dexscreener-token-profiles-latest-v1" ||
        writtenToken.metadataStatus !== "mint_only"
      ) {
        throw new Error("detect dexscreener write did not persist mint-first fields");
      }

      const rerun = await runCliJson<{
        importedCount: number;
        existingCount: number;
        items: Array<{
          importResult?: {
            created: boolean;
          };
        }>;
      }>(
        "detect dexscreener write rerun",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerFilePath,
          "--write",
        ],
        context.smokeId,
      );

      if (
        rerun.importedCount !== 0 ||
        rerun.existingCount !== 1 ||
        rerun.items[0]?.importResult?.created !== false
      ) {
        throw new Error("detect dexscreener write rerun did not report existing token");
      }

      const watched = await runCliJson<{
        dryRun: boolean;
        writeEnabled: boolean;
        watchEnabled: boolean;
        intervalSeconds: number;
        cycleCount: number;
        processedCount: number;
        acceptedCount: number;
        rejectedCount: number;
        importedCount: number;
        existingCount: number;
        items: Array<{
          handoffPayload?: {
            mint: string;
            source?: string;
          };
          detectorResult: {
            ok: boolean;
            mint?: string;
          };
          importResult?: {
            created: boolean;
          };
        }>;
        cycles: Array<{
          cycle: number;
          processedCount: number;
          acceptedCount: number;
          rejectedCount: number;
          importedCount: number;
          existingCount: number;
          items: Array<{
            handoffPayload?: {
              mint: string;
            };
          }>;
        }>;
      }>(
        "detect dexscreener watch dry-run",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerFilePath,
          "--watch",
          "--maxIterations",
          "2",
        ],
        context.smokeId,
      );

      if (
        watched.dryRun !== true ||
        watched.writeEnabled !== false ||
        watched.watchEnabled !== true ||
        watched.intervalSeconds !== 1 ||
        watched.cycleCount !== 2 ||
        watched.processedCount !== 2 ||
        watched.acceptedCount !== 2 ||
        watched.rejectedCount !== 0 ||
        watched.importedCount !== 0 ||
        watched.existingCount !== 0 ||
        watched.items.length !== 2 ||
        watched.cycles.length !== 2
      ) {
        throw new Error("detect dexscreener watch dry-run returned unexpected summary");
      }

      if (
        watched.cycles[0]?.cycle !== 1 ||
        watched.cycles[1]?.cycle !== 2 ||
        watched.cycles[0]?.processedCount !== 1 ||
        watched.cycles[1]?.processedCount !== 1 ||
        watched.cycles[0]?.acceptedCount !== 1 ||
        watched.cycles[1]?.acceptedCount !== 1 ||
        watched.cycles[0]?.items[0]?.handoffPayload?.mint !== context.detectRunnerMint ||
        watched.cycles[1]?.items[0]?.handoffPayload?.mint !== context.detectRunnerMint
      ) {
        throw new Error("detect dexscreener watch dry-run returned unexpected cycle detail");
      }

      await writeFile(
        context.detectRunnerCheckpointFilePath,
        `${JSON.stringify(
          {
            source: "dexscreener-token-profiles-latest-v1",
            eventType: "token_detected",
            detectedAt: "2026-04-16T13:35:37.123Z",
            payload: {
              mintAddress: context.detectRunnerCheckpointMint,
              chainId: "solana",
              tokenAddress: context.detectRunnerCheckpointMint,
              url: "https://dexscreener.com/solana/smoke-detect-runner-checkpoint",
              updatedAt: "2026-04-16T13:35:37.123Z",
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const watchedWithCheckpoint = await runCliJson<{
        checkpointEnabled: boolean;
        checkpointFile?: string;
        checkpointBefore?: string;
        checkpointAfter?: string;
        processedCount: number;
        acceptedCount: number;
        importedCount: number;
        existingCount: number;
        cycles: Array<{
          cycle: number;
          processedCount: number;
          acceptedCount: number;
          importedCount: number;
          existingCount: number;
          checkpointBefore?: string;
          checkpointAfter?: string;
          checkpointFilteredCount: number;
        }>;
      }>(
        "detect dexscreener watch write checkpoint",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerCheckpointFilePath,
          "--write",
          "--watch",
          "--maxIterations",
          "2",
          "--checkpointFile",
          context.detectRunnerCheckpointPath,
        ],
        context.smokeId,
      );

      if (
        watchedWithCheckpoint.checkpointEnabled !== true ||
        watchedWithCheckpoint.checkpointFile !== context.detectRunnerCheckpointPath ||
        watchedWithCheckpoint.checkpointBefore !== undefined ||
        watchedWithCheckpoint.checkpointAfter !== "2026-04-16T13:35:37.123Z" ||
        watchedWithCheckpoint.processedCount !== 1 ||
        watchedWithCheckpoint.acceptedCount !== 1 ||
        watchedWithCheckpoint.importedCount !== 1 ||
        watchedWithCheckpoint.existingCount !== 0 ||
        watchedWithCheckpoint.cycles.length !== 2
      ) {
        throw new Error("detect dexscreener watch write checkpoint returned unexpected summary");
      }

      if (
        watchedWithCheckpoint.cycles[0]?.processedCount !== 1 ||
        watchedWithCheckpoint.cycles[0]?.importedCount !== 1 ||
        watchedWithCheckpoint.cycles[0]?.checkpointBefore !== undefined ||
        watchedWithCheckpoint.cycles[0]?.checkpointAfter !== "2026-04-16T13:35:37.123Z" ||
        watchedWithCheckpoint.cycles[0]?.checkpointFilteredCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.processedCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.acceptedCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.importedCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.existingCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.checkpointBefore !== "2026-04-16T13:35:37.123Z" ||
        watchedWithCheckpoint.cycles[1]?.checkpointAfter !== "2026-04-16T13:35:37.123Z" ||
        watchedWithCheckpoint.cycles[1]?.checkpointFilteredCount !== 1
      ) {
        throw new Error("detect dexscreener watch write checkpoint returned unexpected cycle detail");
      }

      const checkpointRaw = await readFile(context.detectRunnerCheckpointPath, "utf-8");
      const checkpointParsed = JSON.parse(checkpointRaw) as {
        source?: string;
        cursor?: string;
      };

      if (
        checkpointParsed.source !== "dexscreener-token-profiles-latest-v1" ||
        checkpointParsed.cursor !== "2026-04-16T13:35:37.123Z"
      ) {
        throw new Error("detect dexscreener checkpoint file did not persist the expected cursor");
      }

      const rerunWithCheckpoint = await runCliJson<{
        checkpointBefore?: string;
        checkpointAfter?: string;
        processedCount: number;
        importedCount: number;
        existingCount: number;
        cycles: Array<{
          processedCount: number;
          checkpointFilteredCount: number;
        }>;
      }>(
        "detect dexscreener checkpoint rerun",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerCheckpointFilePath,
          "--write",
          "--watch",
          "--maxIterations",
          "1",
          "--checkpointFile",
          context.detectRunnerCheckpointPath,
        ],
        context.smokeId,
      );

      if (
        rerunWithCheckpoint.checkpointBefore !== "2026-04-16T13:35:37.123Z" ||
        rerunWithCheckpoint.checkpointAfter !== "2026-04-16T13:35:37.123Z" ||
        rerunWithCheckpoint.processedCount !== 0 ||
        rerunWithCheckpoint.importedCount !== 0 ||
        rerunWithCheckpoint.existingCount !== 0 ||
        rerunWithCheckpoint.cycles[0]?.processedCount !== 0 ||
        rerunWithCheckpoint.cycles[0]?.checkpointFilteredCount !== 1
      ) {
        throw new Error("detect dexscreener checkpoint rerun did not skip the seen item");
      }

      await writeFile(
        context.detectRunnerIdleLogFilePath,
        `${JSON.stringify(
          {
            source: "dexscreener-token-profiles-latest-v1",
            eventType: "token_detected",
            detectedAt: "2026-04-16T13:45:37.123Z",
            payload: {
              mintAddress: context.detectRunnerIdleLogMint,
              chainId: "solana",
              tokenAddress: context.detectRunnerIdleLogMint,
              url: "https://dexscreener.com/solana/smoke-detect-runner-idle-log",
              updatedAt: "2026-04-16T13:45:37.123Z",
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const watchedWithIdleLogs = await runCliJsonWithStderr<{
        processedCount: number;
        importedCount: number;
        existingCount: number;
        cycles: Array<{
          cycle: number;
          processedCount: number;
          importedCount: number;
          existingCount: number;
        }>;
      }>(
        "detect dexscreener watch idle log throttle",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerIdleLogFilePath,
          "--write",
          "--watch",
          "--maxIterations",
          "12",
          "--checkpointFile",
          context.detectRunnerIdleLogCheckpointPath,
        ],
        context.smokeId,
      );
      const watchedWithIdleLogsJson = watchedWithIdleLogs.parsed;

      if (
        watchedWithIdleLogsJson.processedCount !== 1 ||
        watchedWithIdleLogsJson.importedCount !== 1 ||
        watchedWithIdleLogsJson.existingCount !== 0 ||
        watchedWithIdleLogsJson.cycles.length !== 12 ||
        watchedWithIdleLogsJson.cycles[0]?.processedCount !== 1 ||
        watchedWithIdleLogsJson.cycles[1]?.processedCount !== 0 ||
        watchedWithIdleLogsJson.cycles[9]?.processedCount !== 0 ||
        watchedWithIdleLogsJson.cycles[10]?.processedCount !== 0 ||
        watchedWithIdleLogsJson.cycles[11]?.processedCount !== 0
      ) {
        throw new Error("detect dexscreener watch idle log throttle returned unexpected summary");
      }

      if (
        !watchedWithIdleLogs.stderr.includes("cycle=1") ||
        !watchedWithIdleLogs.stderr.includes("cycle=2") ||
        watchedWithIdleLogs.stderr.includes("cycle=3") ||
        !watchedWithIdleLogs.stderr.includes("idleStreak=10") ||
        !watchedWithIdleLogs.stderr.includes("suppressedIdleCycles=9") ||
        !watchedWithIdleLogs.stderr.includes("idleStreak=11") ||
        !watchedWithIdleLogs.stderr.includes("suppressedIdleCycles=10") ||
        !watchedWithIdleLogs.stderr.includes("heartbeatEveryCycles=10")
      ) {
        throw new Error("detect dexscreener watch idle log heartbeat did not throttle idle stderr logs as expected");
      }

      await writeFile(
        context.detectRunnerInvalidFilePath,
        `${JSON.stringify(
          {
            source: "dexscreener-token-profiles-latest-v1",
            eventType: "token_detected",
            detectedAt: "2026-04-16T13:35:37.123Z",
            payload: {
              chainId: "solana",
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      await runCliFailure(
        "detect dexscreener invalid one-shot",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerInvalidFilePath,
        ],
      );

      const watchedInvalid = await runCliJson<{
        checkpointEnabled: boolean;
        checkpointBefore?: string;
        checkpointAfter?: string;
        checkpointUpdated?: boolean;
        failedCount: number;
        processedCount: number;
        importedCount: number;
        existingCount: number;
        cycles: Array<{
          cycle: number;
          failed: boolean;
          errorMessage?: string;
          processedCount: number;
          importedCount: number;
          existingCount: number;
          checkpointBefore?: string;
          checkpointAfter?: string;
        }>;
      }>(
        "detect dexscreener watch invalid input",
        "src/cli/detectDexscreenerTokenProfiles.ts",
        [
          "--file",
          context.detectRunnerInvalidFilePath,
          "--write",
          "--watch",
          "--maxIterations",
          "2",
          "--checkpointFile",
          context.detectRunnerInvalidCheckpointPath,
        ],
        context.smokeId,
      );

      if (
        watchedInvalid.checkpointEnabled !== true ||
        watchedInvalid.checkpointBefore !== undefined ||
        watchedInvalid.checkpointAfter !== undefined ||
        watchedInvalid.checkpointUpdated !== false ||
        watchedInvalid.failedCount !== 2 ||
        watchedInvalid.processedCount !== 0 ||
        watchedInvalid.importedCount !== 0 ||
        watchedInvalid.existingCount !== 0 ||
        watchedInvalid.cycles.length !== 2
      ) {
        throw new Error("detect dexscreener watch invalid input returned unexpected summary");
      }

      if (
        watchedInvalid.cycles[0]?.cycle !== 1 ||
        watchedInvalid.cycles[1]?.cycle !== 2 ||
        watchedInvalid.cycles[0]?.failed !== true ||
        watchedInvalid.cycles[1]?.failed !== true ||
        !watchedInvalid.cycles[0]?.errorMessage?.includes('"mintAddress" must be a non-empty string') ||
        !watchedInvalid.cycles[1]?.errorMessage?.includes('"mintAddress" must be a non-empty string') ||
        watchedInvalid.cycles[0]?.processedCount !== 0 ||
        watchedInvalid.cycles[1]?.processedCount !== 0 ||
        watchedInvalid.cycles[0]?.checkpointBefore !== undefined ||
        watchedInvalid.cycles[1]?.checkpointAfter !== undefined
      ) {
        throw new Error("detect dexscreener watch invalid input did not continue after cycle failures");
      }

      try {
        await readFile(context.detectRunnerInvalidCheckpointPath, "utf-8");
        throw new Error("detect dexscreener watch invalid input unexpectedly wrote a checkpoint");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    });

    await runStep("detect geckoterminal dry-run and write", async () => {
      await writeFile(
        context.geckoterminalDetectRunnerFilePath,
        `${JSON.stringify(
          {
            data: [
              {
                id: "solana_CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc",
                type: "pool",
                attributes: {
                  address: "CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc",
                  name: "GECKO / SOL",
                  pool_created_at: "2026-04-18T02:13:55Z",
                },
                relationships: {
                  base_token: {
                    data: {
                      id: `solana_${context.geckoterminalDetectRunnerMint}`,
                      type: "token",
                    },
                  },
                  quote_token: {
                    data: {
                      id: "solana_So11111111111111111111111111111111111111112",
                      type: "token",
                    },
                  },
                  dex: {
                    data: {
                      id: "pump-fun",
                      type: "dex",
                    },
                  },
                },
              },
            ],
            included: [
              {
                id: `solana_${context.geckoterminalDetectRunnerMint}`,
                type: "token",
                attributes: {
                  address: context.geckoterminalDetectRunnerMint,
                  symbol: "GECKO",
                  decimals: 6,
                },
              },
              {
                id: "solana_So11111111111111111111111111111111111111112",
                type: "token",
                attributes: {
                  address: "So11111111111111111111111111111111111111112",
                  symbol: "SOL",
                  decimals: 9,
                },
              },
              {
                id: "pump-fun",
                type: "dex",
                attributes: {
                  name: "Pump.fun",
                },
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const dryRun = await runCliJson<{
        mode: string;
        file?: string;
        dryRun: boolean;
        writeEnabled: boolean;
        source: string;
        eventType: string;
        detectedAt: string;
        mintAddress: string;
        handoffPayload?: {
          mint: string;
          source?: string;
          firstSeenSourceSnapshot?: {
            source: string;
            detectedAt: string;
            poolCreatedAt?: string;
            poolAddress?: string;
            dexName?: string;
            baseTokenAddress?: string;
            quoteTokenAddress?: string;
          };
        };
        detectorResult: {
          ok: boolean;
          mint?: string;
          source?: string;
        };
        importResult?: {
          created: boolean;
        };
      }>(
        "detect geckoterminal dry-run",
        "src/cli/detectGeckoterminalNewPools.ts",
        [
          "--file",
          context.geckoterminalDetectRunnerFilePath,
        ],
        context.smokeId,
      );

      if (
        dryRun.mode !== "file" ||
        dryRun.file !== context.geckoterminalDetectRunnerFilePath ||
        dryRun.dryRun !== true ||
        dryRun.writeEnabled !== false ||
        dryRun.source !== "geckoterminal.new_pools" ||
        dryRun.eventType !== "new_pool" ||
        dryRun.mintAddress !== context.geckoterminalDetectRunnerMint
      ) {
        throw new Error("detect geckoterminal dry-run returned unexpected summary");
      }

      if (
        dryRun.handoffPayload?.mint !== context.geckoterminalDetectRunnerMint ||
        dryRun.handoffPayload?.source !== "geckoterminal.new_pools" ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.source !==
          "geckoterminal.new_pools" ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.detectedAt !== dryRun.detectedAt ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.poolCreatedAt !==
          "2026-04-18T02:13:55Z" ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.poolAddress !==
          "CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc" ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.dexName !== "Pump.fun" ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.baseTokenAddress !==
          context.geckoterminalDetectRunnerMint ||
        dryRun.handoffPayload?.firstSeenSourceSnapshot?.quoteTokenAddress !==
          "So11111111111111111111111111111111111111112" ||
        dryRun.detectorResult.ok !== true ||
        dryRun.detectorResult.mint !== context.geckoterminalDetectRunnerMint ||
        dryRun.importResult !== undefined
      ) {
        throw new Error("detect geckoterminal dry-run returned unexpected item fields");
      }

      const watched = await runCliJson<{
        dryRun: boolean;
        writeEnabled: boolean;
        watchEnabled: boolean;
        checkpointEnabled: boolean;
        intervalSeconds: number;
        maxIterations: number;
        cycleCount: number;
        inputCount: number;
        processedCount: number;
        acceptedCount: number;
        rejectedCount: number;
        importedCount: number;
        existingCount: number;
        items: Array<{
          handoffPayload?: {
            mint: string;
            source?: string;
          };
        }>;
        cycles: Array<{
          cycle: number;
          inputCount: number;
          processedCount: number;
          acceptedCount: number;
          rejectedCount: number;
          items: Array<{
            handoffPayload?: {
              mint: string;
            };
          }>;
        }>;
      }>(
        "detect geckoterminal watch dry-run",
        "src/cli/detectGeckoterminalNewPools.ts",
        [
          "--file",
          context.geckoterminalDetectRunnerFilePath,
          "--watch",
          "--maxIterations",
          "2",
        ],
        context.smokeId,
      );

      if (
        watched.dryRun !== true ||
        watched.writeEnabled !== false ||
        watched.watchEnabled !== true ||
        watched.checkpointEnabled !== false ||
        watched.intervalSeconds !== 1 ||
        watched.maxIterations !== 2 ||
        watched.cycleCount !== 2 ||
        watched.inputCount !== 2 ||
        watched.processedCount !== 2 ||
        watched.acceptedCount !== 2 ||
        watched.rejectedCount !== 0 ||
        watched.importedCount !== 0 ||
        watched.existingCount !== 0 ||
        watched.items.length !== 2 ||
        watched.cycles.length !== 2
      ) {
        throw new Error("detect geckoterminal watch dry-run returned unexpected summary");
      }

      if (
        watched.cycles[0]?.cycle !== 1 ||
        watched.cycles[1]?.cycle !== 2 ||
        watched.cycles[0]?.inputCount !== 1 ||
        watched.cycles[1]?.inputCount !== 1 ||
        watched.cycles[0]?.processedCount !== 1 ||
        watched.cycles[1]?.processedCount !== 1 ||
        watched.cycles[0]?.acceptedCount !== 1 ||
        watched.cycles[1]?.acceptedCount !== 1 ||
        watched.cycles[0]?.items[0]?.handoffPayload?.mint !== context.geckoterminalDetectRunnerMint ||
        watched.cycles[1]?.items[0]?.handoffPayload?.mint !== context.geckoterminalDetectRunnerMint
      ) {
        throw new Error("detect geckoterminal watch dry-run returned unexpected cycle detail");
      }

      const tokenBeforeWrite = await db.token.findUnique({
        where: { mint: context.geckoterminalDetectRunnerMint },
        select: { id: true },
      });

      if (tokenBeforeWrite) {
        throw new Error("detect geckoterminal dry-run unexpectedly wrote a token");
      }

      const written = await runCliJson<{
        mode: string;
        dryRun: boolean;
        writeEnabled: boolean;
        handoffPayload?: {
          mint: string;
          source?: string;
          firstSeenSourceSnapshot?: {
            source: string;
            detectedAt: string;
            poolCreatedAt?: string;
            poolAddress?: string;
            dexName?: string;
            baseTokenAddress?: string;
            quoteTokenAddress?: string;
          };
        };
        importResult?: {
          mint: string;
          metadataStatus: string;
          created: boolean;
        };
      }>(
        "detect geckoterminal write",
        "src/cli/detectGeckoterminalNewPools.ts",
        [
          "--file",
          context.geckoterminalDetectRunnerFilePath,
          "--write",
        ],
        context.smokeId,
      );

      if (
        written.mode !== "file" ||
        written.dryRun !== false ||
        written.writeEnabled !== true ||
        written.handoffPayload?.mint !== context.geckoterminalDetectRunnerMint ||
        written.handoffPayload?.source !== "geckoterminal.new_pools" ||
        written.handoffPayload?.firstSeenSourceSnapshot?.poolCreatedAt !==
          "2026-04-18T02:13:55Z" ||
        written.handoffPayload?.firstSeenSourceSnapshot?.dexName !== "Pump.fun" ||
        written.importResult?.mint !== context.geckoterminalDetectRunnerMint ||
        written.importResult?.metadataStatus !== "mint_only" ||
        written.importResult?.created !== true
      ) {
        throw new Error("detect geckoterminal write returned unexpected summary");
      }

      const writtenToken = await db.token.findUnique({
        where: { mint: context.geckoterminalDetectRunnerMint },
        select: {
          mint: true,
          source: true,
          metadataStatus: true,
          entrySnapshot: true,
        },
      });

      if (!writtenToken) {
        throw new Error("detect geckoterminal write did not create a token");
      }

      if (
        writtenToken.source !== "geckoterminal.new_pools" ||
        writtenToken.metadataStatus !== "mint_only"
      ) {
        throw new Error("detect geckoterminal write did not persist mint-first fields");
      }

      const entrySnapshot = writtenToken.entrySnapshot as
        | {
            firstSeenSourceSnapshot?: {
              source?: string;
              detectedAt?: string;
              poolCreatedAt?: string;
              poolAddress?: string;
              dexName?: string;
              baseTokenAddress?: string;
              quoteTokenAddress?: string;
            };
          }
        | null;

      if (
        !entrySnapshot?.firstSeenSourceSnapshot ||
        entrySnapshot.firstSeenSourceSnapshot.source !== "geckoterminal.new_pools" ||
        entrySnapshot.firstSeenSourceSnapshot.detectedAt !==
          written.handoffPayload?.firstSeenSourceSnapshot?.detectedAt ||
        entrySnapshot.firstSeenSourceSnapshot.poolCreatedAt !== "2026-04-18T02:13:55Z" ||
        entrySnapshot.firstSeenSourceSnapshot.poolAddress !==
          "CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc" ||
        entrySnapshot.firstSeenSourceSnapshot.dexName !== "Pump.fun" ||
        entrySnapshot.firstSeenSourceSnapshot.baseTokenAddress !==
          context.geckoterminalDetectRunnerMint ||
        entrySnapshot.firstSeenSourceSnapshot.quoteTokenAddress !==
          "So11111111111111111111111111111111111111112"
      ) {
        throw new Error("detect geckoterminal write did not persist the first-seen source snapshot");
      }

      const rerun = await runCliJson<{
        importResult?: {
          created: boolean;
        };
      }>(
        "detect geckoterminal write rerun",
        "src/cli/detectGeckoterminalNewPools.ts",
        [
          "--file",
          context.geckoterminalDetectRunnerFilePath,
          "--write",
        ],
        context.smokeId,
      );

      if (rerun.importResult?.created !== false) {
        throw new Error("detect geckoterminal write rerun did not report existing token");
      }

      await writeFile(
        context.geckoterminalDetectRunnerCheckpointFilePath,
        `${JSON.stringify(
          {
            data: [
              {
                id: "solana_9sgXkt6Y9vVNFi9cvJ9wCcwJDhjF29VAzyhnvWkjeABC",
                type: "pool",
                attributes: {
                  address: "9sgXkt6Y9vVNFi9cvJ9wCcwJDhjF29VAzyhnvWkjeABC",
                  name: "GECKOCP / SOL",
                  pool_created_at: "2026-04-18T02:35:54Z",
                },
                relationships: {
                  base_token: {
                    data: {
                      id: `solana_${context.geckoterminalDetectRunnerCheckpointMint}`,
                      type: "token",
                    },
                  },
                  quote_token: {
                    data: {
                      id: "solana_So11111111111111111111111111111111111111112",
                      type: "token",
                    },
                  },
                  dex: {
                    data: {
                      id: "pumpswap",
                      type: "dex",
                    },
                  },
                },
              },
            ],
            included: [
              {
                id: `solana_${context.geckoterminalDetectRunnerCheckpointMint}`,
                type: "token",
                attributes: {
                  address: context.geckoterminalDetectRunnerCheckpointMint,
                  symbol: "GECKOCP",
                  decimals: 6,
                },
              },
              {
                id: "solana_So11111111111111111111111111111111111111112",
                type: "token",
                attributes: {
                  address: "So11111111111111111111111111111111111111112",
                  symbol: "SOL",
                  decimals: 9,
                },
              },
              {
                id: "pumpswap",
                type: "dex",
                attributes: {
                  name: "PumpSwap",
                },
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const watchedWithCheckpoint = await runCliJson<{
        checkpointEnabled: boolean;
        checkpointFile?: string;
        checkpointBefore?: {
          poolCreatedAt: string;
          poolAddress: string;
        };
        checkpointAfter?: {
          poolCreatedAt: string;
          poolAddress: string;
        };
        processedCount: number;
        acceptedCount: number;
        importedCount: number;
        existingCount: number;
        cycles: Array<{
          cycle: number;
          processedCount: number;
          acceptedCount: number;
          importedCount: number;
          existingCount: number;
          checkpointBefore?: {
            poolCreatedAt: string;
            poolAddress: string;
          };
          checkpointAfter?: {
            poolCreatedAt: string;
            poolAddress: string;
          };
          checkpointFilteredCount: number;
        }>;
      }>(
        "detect geckoterminal watch write checkpoint",
        "src/cli/detectGeckoterminalNewPools.ts",
        [
          "--file",
          context.geckoterminalDetectRunnerCheckpointFilePath,
          "--write",
          "--watch",
          "--maxIterations",
          "2",
          "--checkpointFile",
          context.geckoterminalDetectRunnerCheckpointPath,
        ],
        context.smokeId,
      );

      if (
        watchedWithCheckpoint.checkpointEnabled !== true ||
        watchedWithCheckpoint.checkpointFile !== context.geckoterminalDetectRunnerCheckpointPath ||
        watchedWithCheckpoint.checkpointBefore !== undefined ||
        watchedWithCheckpoint.checkpointAfter?.poolCreatedAt !== "2026-04-18T02:35:54.000Z" ||
        watchedWithCheckpoint.checkpointAfter?.poolAddress !==
          "9sgXkt6Y9vVNFi9cvJ9wCcwJDhjF29VAzyhnvWkjeABC" ||
        watchedWithCheckpoint.processedCount !== 1 ||
        watchedWithCheckpoint.acceptedCount !== 1 ||
        watchedWithCheckpoint.importedCount !== 1 ||
        watchedWithCheckpoint.existingCount !== 0 ||
        watchedWithCheckpoint.cycles.length !== 2
      ) {
        throw new Error("detect geckoterminal watch write checkpoint returned unexpected summary");
      }

      if (
        watchedWithCheckpoint.cycles[0]?.processedCount !== 1 ||
        watchedWithCheckpoint.cycles[0]?.importedCount !== 1 ||
        watchedWithCheckpoint.cycles[0]?.checkpointBefore !== undefined ||
        watchedWithCheckpoint.cycles[0]?.checkpointAfter?.poolCreatedAt !==
          "2026-04-18T02:35:54.000Z" ||
        watchedWithCheckpoint.cycles[0]?.checkpointAfter?.poolAddress !==
          "9sgXkt6Y9vVNFi9cvJ9wCcwJDhjF29VAzyhnvWkjeABC" ||
        watchedWithCheckpoint.cycles[0]?.checkpointFilteredCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.processedCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.acceptedCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.importedCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.existingCount !== 0 ||
        watchedWithCheckpoint.cycles[1]?.checkpointBefore?.poolCreatedAt !==
          "2026-04-18T02:35:54.000Z" ||
        watchedWithCheckpoint.cycles[1]?.checkpointAfter?.poolCreatedAt !==
          "2026-04-18T02:35:54.000Z" ||
        watchedWithCheckpoint.cycles[1]?.checkpointFilteredCount !== 1
      ) {
        throw new Error("detect geckoterminal watch write checkpoint returned unexpected cycle detail");
      }

      const geckoCheckpointRaw = await readFile(
        context.geckoterminalDetectRunnerCheckpointPath,
        "utf-8",
      );
      const geckoCheckpointParsed = JSON.parse(geckoCheckpointRaw) as {
        source?: string;
        cursor?: {
          poolCreatedAt?: string;
          poolAddress?: string;
        };
      };

      if (
        geckoCheckpointParsed.source !== "geckoterminal.new_pools" ||
        geckoCheckpointParsed.cursor?.poolCreatedAt !== "2026-04-18T02:35:54.000Z" ||
        geckoCheckpointParsed.cursor?.poolAddress !==
          "9sgXkt6Y9vVNFi9cvJ9wCcwJDhjF29VAzyhnvWkjeABC"
      ) {
        throw new Error("detect geckoterminal checkpoint file did not persist the expected cursor");
      }

      await writeFile(
        context.geckoterminalDetectRunnerInvalidFilePath,
        `${JSON.stringify(
          {
            data: [
              {
                id: "invalid_pool",
                type: "pool",
                attributes: {},
                relationships: {},
              },
            ],
            included: [],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const watchedInvalid = await runCliJson<{
        checkpointEnabled: boolean;
        checkpointBefore?: {
          poolCreatedAt: string;
          poolAddress: string;
        };
        checkpointAfter?: {
          poolCreatedAt: string;
          poolAddress: string;
        };
        checkpointUpdated?: boolean;
        failedCount: number;
        processedCount: number;
        importedCount: number;
        existingCount: number;
        cycles: Array<{
          cycle: number;
          failed: boolean;
          errorMessage?: string;
          processedCount: number;
          importedCount: number;
          existingCount: number;
          checkpointBefore?: {
            poolCreatedAt: string;
            poolAddress: string;
          };
          checkpointAfter?: {
            poolCreatedAt: string;
            poolAddress: string;
          };
        }>;
      }>(
        "detect geckoterminal watch invalid input",
        "src/cli/detectGeckoterminalNewPools.ts",
        [
          "--file",
          context.geckoterminalDetectRunnerInvalidFilePath,
          "--write",
          "--watch",
          "--maxIterations",
          "2",
          "--checkpointFile",
          context.geckoterminalDetectRunnerInvalidCheckpointPath,
        ],
        context.smokeId,
      );

      if (
        watchedInvalid.checkpointEnabled !== true ||
        watchedInvalid.checkpointBefore !== undefined ||
        watchedInvalid.checkpointAfter !== undefined ||
        watchedInvalid.checkpointUpdated !== false ||
        watchedInvalid.failedCount !== 2 ||
        watchedInvalid.processedCount !== 0 ||
        watchedInvalid.importedCount !== 0 ||
        watchedInvalid.existingCount !== 0 ||
        watchedInvalid.cycles.length !== 2
      ) {
        throw new Error("detect geckoterminal watch invalid input returned unexpected summary");
      }

      if (
        watchedInvalid.cycles[0]?.cycle !== 1 ||
        watchedInvalid.cycles[1]?.cycle !== 2 ||
        watchedInvalid.cycles[0]?.failed !== true ||
        watchedInvalid.cycles[1]?.failed !== true ||
        !watchedInvalid.cycles[0]?.errorMessage?.includes("relationships.base_token") ||
        !watchedInvalid.cycles[1]?.errorMessage?.includes("relationships.base_token") ||
        watchedInvalid.cycles[0]?.processedCount !== 0 ||
        watchedInvalid.cycles[1]?.processedCount !== 0 ||
        watchedInvalid.cycles[0]?.checkpointBefore !== undefined ||
        watchedInvalid.cycles[1]?.checkpointAfter !== undefined
      ) {
        throw new Error("detect geckoterminal watch invalid input did not continue after cycle failures");
      }

      try {
        await readFile(context.geckoterminalDetectRunnerInvalidCheckpointPath, "utf-8");
        throw new Error("detect geckoterminal watch invalid input unexpectedly wrote a checkpoint");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    });

    await runStep("metric snapshot geckoterminal", async () => {
      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "metric snapshot geckoterminal import",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.metricSnapshotMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      await writeFile(
        context.metricSnapshotFilePath,
        `${JSON.stringify(
          {
            data: {
              id: `solana_${context.metricSnapshotMint}`,
              type: "token",
              attributes: {
                address: context.metricSnapshotMint,
                name: "Smoke Metric Snapshot",
                symbol: "SMS",
                price_usd: "0.123",
                fdv_usd: "25000",
                market_cap_usd: null,
                total_reserve_in_usd: "1500",
                volume_usd: {
                  h24: "1234",
                },
              },
              relationships: {
                top_pools: {
                  data: [
                    {
                      id: "solana_smoke_pool",
                      type: "pool",
                    },
                  ],
                },
              },
            },
            included: [
              {
                id: "solana_smoke_pool",
                type: "pool",
                attributes: {
                  address: "smoke_pool",
                  name: "SMS / SOL",
                  pool_created_at: "2026-04-18T00:00:00Z",
                  token_price_usd: "0.123",
                  fdv_usd: "25000",
                  market_cap_usd: null,
                  reserve_in_usd: "1500",
                  volume_usd: {
                    h24: "321",
                  },
                  price_change_percentage: {
                    h24: "1.5",
                  },
                },
                relationships: {
                  base_token: {
                    data: {
                      id: `solana_${context.metricSnapshotMint}`,
                      type: "token",
                    },
                  },
                  quote_token: {
                    data: {
                      id: "solana_So11111111111111111111111111111111111111112",
                      type: "token",
                    },
                  },
                  dex: {
                    data: {
                      id: "pumpswap",
                      type: "dex",
                    },
                  },
                },
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
      process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.metricSnapshotFilePath;

      try {
        const dryRun = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          summary: {
            selectedCount: number;
            okCount: number;
            skippedCount: number;
            errorCount: number;
            writtenCount: number;
          };
          items: Array<{
            metricCandidate?: {
              volume24h: number | null;
            };
            writeSummary: {
              metricId: number | null;
            };
          }>;
        }>(
          "metric snapshot geckoterminal dry-run",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            context.metricSnapshotMint,
          ],
          context.smokeId,
        );

        if (
          dryRun.mode !== "single" ||
          dryRun.dryRun !== true ||
          dryRun.writeEnabled !== false ||
          dryRun.summary.selectedCount !== 1 ||
          dryRun.summary.okCount !== 1 ||
          dryRun.summary.skippedCount !== 0 ||
          dryRun.summary.errorCount !== 0 ||
          dryRun.summary.writtenCount !== 0 ||
          dryRun.items[0]?.metricCandidate?.volume24h !== 1234 ||
          dryRun.items[0]?.writeSummary.metricId !== null
        ) {
          throw new Error("metric snapshot geckoterminal dry-run returned unexpected summary");
        }

        const metricsBeforeWrite = await db.metric.count({
          where: {
            token: {
              mint: context.metricSnapshotMint,
            },
          },
        });

        if (metricsBeforeWrite !== 0) {
          throw new Error("metric snapshot geckoterminal dry-run unexpectedly wrote a metric");
        }

        const oneShotWrite = await runCliJson<{
          dryRun: boolean;
          writeEnabled: boolean;
          summary: {
            writtenCount: number;
          };
          items: Array<{
            metricCandidate?: {
              volume24h: number | null;
            };
            writeSummary: {
              metricId: number | null;
            };
          }>;
        }>(
          "metric snapshot geckoterminal one-shot write",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            context.metricSnapshotMint,
            "--write",
          ],
          context.smokeId,
        );

        if (
          oneShotWrite.dryRun !== false ||
          oneShotWrite.writeEnabled !== true ||
          oneShotWrite.summary.writtenCount !== 1 ||
          oneShotWrite.items[0]?.metricCandidate?.volume24h !== 1234 ||
          typeof oneShotWrite.items[0]?.writeSummary.metricId !== "number"
        ) {
          throw new Error("metric snapshot geckoterminal one-shot write returned unexpected summary");
        }

        const watchDryRun = await runCliJson<{
          watchEnabled: boolean;
          intervalSeconds: number;
          maxIterations?: number;
          cycleCount: number;
          failedCount: number;
          selectedCount: number;
          okCount: number;
          skippedCount: number;
          errorCount: number;
          writtenCount: number;
          items: Array<{
            metricCandidate?: {
              volume24h: number | null;
            };
            writeSummary: {
              metricId: number | null;
            };
          }>;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            summary: {
              selectedCount: number;
              okCount: number;
              skippedCount: number;
              errorCount: number;
              writtenCount: number;
            };
            items: Array<{
              metricCandidate?: {
                volume24h: number | null;
              };
            }>;
          }>;
        }>(
          "metric snapshot geckoterminal watch dry-run",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            context.metricSnapshotMint,
            "--watch",
            "--intervalSeconds",
            "1",
            "--maxIterations",
            "2",
          ],
          context.smokeId,
        );

        if (
          watchDryRun.watchEnabled !== true ||
          watchDryRun.intervalSeconds !== 1 ||
          watchDryRun.maxIterations !== 2 ||
          watchDryRun.cycleCount !== 2 ||
          watchDryRun.failedCount !== 0 ||
          watchDryRun.selectedCount !== 2 ||
          watchDryRun.okCount !== 2 ||
          watchDryRun.skippedCount !== 0 ||
          watchDryRun.errorCount !== 0 ||
          watchDryRun.writtenCount !== 0 ||
          watchDryRun.items.length !== 2 ||
          watchDryRun.cycles.length !== 2 ||
          watchDryRun.cycles[0]?.cycle !== 1 ||
          watchDryRun.cycles[1]?.cycle !== 2 ||
          watchDryRun.cycles[0]?.failed !== false ||
          watchDryRun.cycles[1]?.failed !== false ||
          watchDryRun.cycles[0]?.summary.okCount !== 1 ||
          watchDryRun.cycles[0]?.summary.skippedCount !== 0 ||
          watchDryRun.cycles[1]?.summary.okCount !== 1 ||
          watchDryRun.cycles[1]?.summary.skippedCount !== 0 ||
          watchDryRun.cycles[0]?.items[0]?.metricCandidate?.volume24h !== 1234 ||
          watchDryRun.cycles[1]?.items[0]?.metricCandidate?.volume24h !== 1234
        ) {
          throw new Error("metric snapshot geckoterminal watch dry-run returned unexpected summary");
        }

        const watchWrite = await runCliJson<{
          dryRun: boolean;
          writeEnabled: boolean;
          watchEnabled: boolean;
          cycleCount: number;
          failedCount: number;
          skippedCount: number;
          writtenCount: number;
          items: Array<{
            metricCandidate?: {
              volume24h: number | null;
            };
            writeSummary: {
              metricId: number | null;
            };
          }>;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            summary: {
              skippedCount: number;
              writtenCount: number;
            };
            items: Array<{
              writeSummary: {
                metricId: number | null;
              };
              metricCandidate?: {
                volume24h: number | null;
              };
            }>;
          }>;
        }>(
          "metric snapshot geckoterminal watch write",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            context.metricSnapshotMint,
            "--write",
            "--watch",
            "--intervalSeconds",
            "1",
            "--maxIterations",
            "2",
          ],
          context.smokeId,
        );

        if (
          watchWrite.dryRun !== false ||
          watchWrite.writeEnabled !== true ||
          watchWrite.watchEnabled !== true ||
          watchWrite.cycleCount !== 2 ||
          watchWrite.failedCount !== 0 ||
          watchWrite.skippedCount !== 0 ||
          watchWrite.writtenCount !== 2 ||
          watchWrite.items.length !== 2 ||
          watchWrite.cycles.length !== 2 ||
          watchWrite.cycles[0]?.summary.writtenCount !== 1 ||
          watchWrite.cycles[0]?.summary.skippedCount !== 0 ||
          watchWrite.cycles[1]?.summary.writtenCount !== 1 ||
          watchWrite.cycles[1]?.summary.skippedCount !== 0 ||
          typeof watchWrite.cycles[0]?.items[0]?.writeSummary.metricId !== "number" ||
          typeof watchWrite.cycles[1]?.items[0]?.writeSummary.metricId !== "number" ||
          watchWrite.cycles[0]?.items[0]?.metricCandidate?.volume24h !== 1234 ||
          watchWrite.cycles[1]?.items[0]?.metricCandidate?.volume24h !== 1234
        ) {
          throw new Error("metric snapshot geckoterminal watch write returned unexpected summary");
        }

        const writtenMetrics = await db.metric.findMany({
          where: {
            token: {
              mint: context.metricSnapshotMint,
            },
          },
          orderBy: [{ id: "asc" }],
          select: {
            source: true,
            volume24h: true,
            rawJson: true,
          },
        });

        if (
          writtenMetrics.length !== 3 ||
          writtenMetrics[0]?.source !== "geckoterminal.token_snapshot" ||
          writtenMetrics[1]?.source !== "geckoterminal.token_snapshot" ||
          writtenMetrics[2]?.source !== "geckoterminal.token_snapshot" ||
          writtenMetrics[0]?.volume24h !== 1234 ||
          writtenMetrics[1]?.volume24h !== 1234 ||
          writtenMetrics[2]?.volume24h !== 1234
        ) {
          throw new Error("metric snapshot geckoterminal did not append expected metric rows");
        }

        const rawJsonBytes = writtenMetrics.map((metric) =>
          Buffer.byteLength(JSON.stringify(metric.rawJson), "utf-8"),
        );

        if (rawJsonBytes.some((bytes) => bytes <= 0 || bytes > 2048)) {
          throw new Error("metric snapshot geckoterminal rawJson size was unexpected");
        }

        for (const mint of context.metricSnapshotRateLimitMints) {
          await runCliJson<{
            mint: string;
            created: boolean;
          }>(
            `metric snapshot geckoterminal rate limit import ${mint}`,
            "src/cli/importMint.ts",
            [
              "--mint",
              mint,
              "--source",
              "geckoterminal.new_pools",
            ],
            context.smokeId,
          );
        }

        const previousSnapshotFileForRateLimit = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        const previousTokenApiUrl = process.env.GECKOTERMINAL_TOKEN_API_URL;
        const previousInjectedSnapshotError =
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE;

        try {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.metricSnapshotFilePath;
          delete process.env.GECKOTERMINAL_TOKEN_API_URL;
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE =
            "GeckoTerminal token snapshot request failed: 429 Too Many Requests";

          const rateLimitedWatch = await runCliJsonWithStderr<{
            watchEnabled: boolean;
            cycleCount: number;
            failedCount: number;
            selectedCount: number;
            okCount: number;
            skippedCount: number;
            errorCount: number;
            writtenCount: number;
            rateLimited: boolean;
            rateLimitedCount: number;
            abortedDueToRateLimit: boolean;
            skippedAfterRateLimit: number;
            items: Array<{
              status: string;
              error?: string;
              metricCandidate?: {
                volume24h: number | null;
              };
            }>;
            cycles: Array<{
              cycle: number;
              failed: boolean;
              summary: {
                selectedCount: number;
                okCount: number;
                skippedCount: number;
                errorCount: number;
                writtenCount: number;
                rateLimited: boolean;
                rateLimitedCount: number;
                abortedDueToRateLimit: boolean;
                skippedAfterRateLimit: number;
              };
              items: Array<{
                status: string;
                error?: string;
                metricCandidate?: {
                  volume24h: number | null;
                };
              }>;
            }>;
          }>(
            "metric snapshot geckoterminal watch rate limit short circuit",
            "src/cli/metricSnapshotGeckoterminal.ts",
            [
              "--watch",
              "--intervalSeconds",
              "1",
              "--maxIterations",
              "2",
              "--limit",
              "2",
              "--sinceMinutes",
              "5",
            ],
            context.smokeId,
          );

          const rateLimitedWatchJson = rateLimitedWatch.parsed;
          if (
            rateLimitedWatchJson.watchEnabled !== true ||
            rateLimitedWatchJson.cycleCount !== 2 ||
            rateLimitedWatchJson.failedCount !== 0 ||
            rateLimitedWatchJson.selectedCount !== 4 ||
            rateLimitedWatchJson.okCount !== 2 ||
            rateLimitedWatchJson.skippedCount !== 0 ||
            rateLimitedWatchJson.errorCount !== 1 ||
            rateLimitedWatchJson.writtenCount !== 0 ||
            rateLimitedWatchJson.rateLimited !== true ||
            rateLimitedWatchJson.rateLimitedCount !== 1 ||
            rateLimitedWatchJson.abortedDueToRateLimit !== true ||
            rateLimitedWatchJson.skippedAfterRateLimit !== 1 ||
            rateLimitedWatchJson.items.length !== 3 ||
            rateLimitedWatchJson.cycles.length !== 2 ||
            rateLimitedWatchJson.cycles[0]?.cycle !== 1 ||
            rateLimitedWatchJson.cycles[0]?.failed !== false ||
            rateLimitedWatchJson.cycles[0]?.summary.selectedCount !== 2 ||
            rateLimitedWatchJson.cycles[0]?.summary.okCount !== 0 ||
            rateLimitedWatchJson.cycles[0]?.summary.errorCount !== 1 ||
            rateLimitedWatchJson.cycles[0]?.summary.rateLimited !== true ||
            rateLimitedWatchJson.cycles[0]?.summary.rateLimitedCount !== 1 ||
            rateLimitedWatchJson.cycles[0]?.summary.abortedDueToRateLimit !== true ||
            rateLimitedWatchJson.cycles[0]?.summary.skippedAfterRateLimit !== 1 ||
            rateLimitedWatchJson.cycles[0]?.items.length !== 1 ||
            rateLimitedWatchJson.cycles[0]?.items[0]?.status !== "error" ||
            !rateLimitedWatchJson.cycles[0]?.items[0]?.error?.includes("429 Too Many Requests") ||
            rateLimitedWatchJson.cycles[1]?.cycle !== 2 ||
            rateLimitedWatchJson.cycles[1]?.failed !== false ||
            rateLimitedWatchJson.cycles[1]?.summary.selectedCount !== 2 ||
            rateLimitedWatchJson.cycles[1]?.summary.okCount !== 2 ||
            rateLimitedWatchJson.cycles[1]?.summary.errorCount !== 0 ||
            rateLimitedWatchJson.cycles[1]?.summary.rateLimited !== false ||
            rateLimitedWatchJson.cycles[1]?.summary.rateLimitedCount !== 0 ||
            rateLimitedWatchJson.cycles[1]?.summary.abortedDueToRateLimit !== false ||
            rateLimitedWatchJson.cycles[1]?.summary.skippedAfterRateLimit !== 0 ||
            rateLimitedWatchJson.cycles[1]?.items.length !== 2 ||
            rateLimitedWatchJson.cycles[1]?.items[0]?.metricCandidate?.volume24h !== 1234 ||
            rateLimitedWatchJson.cycles[1]?.items[1]?.metricCandidate?.volume24h !== 1234
          ) {
            throw new Error(
              "metric snapshot geckoterminal watch rate limit short circuit returned unexpected summary",
            );
          }

          if (
            !rateLimitedWatch.stderr.includes("cycle=1") ||
            !rateLimitedWatch.stderr.includes("rateLimited=true") ||
            !rateLimitedWatch.stderr.includes("skippedAfterRateLimit=1") ||
            !rateLimitedWatch.stderr.includes("cycle=2") ||
            !rateLimitedWatch.stderr.includes("rateLimited=false")
          ) {
            throw new Error(
              "metric snapshot geckoterminal watch rate limit short circuit did not log expected stderr summary",
            );
          }
        } finally {
          if (previousSnapshotFileForRateLimit === undefined) {
            delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
          } else {
            process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFileForRateLimit;
          }

          if (previousTokenApiUrl === undefined) {
            delete process.env.GECKOTERMINAL_TOKEN_API_URL;
          } else {
            process.env.GECKOTERMINAL_TOKEN_API_URL = previousTokenApiUrl;
          }

          if (previousInjectedSnapshotError === undefined) {
            delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE;
          } else {
            process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE = previousInjectedSnapshotError;
          }
        }

        await runCliJson<{
          mint: string;
          created: boolean;
        }>(
          "metric snapshot geckoterminal gap import",
          "src/cli/importMint.ts",
          [
            "--mint",
            context.metricSnapshotGapMint,
            "--source",
            "geckoterminal.new_pools",
          ],
          context.smokeId,
        );

        await writeFile(
          context.metricSnapshotFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.metricSnapshotGapMint}`,
                type: "token",
                attributes: {
                  address: context.metricSnapshotGapMint,
                  name: "Smoke Metric Snapshot Gap",
                  symbol: "SMSG",
                  price_usd: "0.456",
                  fdv_usd: "26000",
                  market_cap_usd: null,
                  total_reserve_in_usd: "1700",
                  volume_usd: {
                    h24: "2345",
                  },
                },
                relationships: {
                  top_pools: {
                    data: [
                      {
                        id: "solana_smoke_gap_pool",
                        type: "pool",
                      },
                    ],
                  },
                },
              },
              included: [
                {
                  id: "solana_smoke_gap_pool",
                  type: "pool",
                  attributes: {
                    address: "smoke_gap_pool",
                    name: "SMSG / SOL",
                    pool_created_at: "2026-04-18T00:10:00Z",
                    token_price_usd: "0.456",
                    fdv_usd: "26000",
                    market_cap_usd: null,
                    reserve_in_usd: "1700",
                    volume_usd: {
                      h24: "456",
                    },
                    price_change_percentage: {
                      h24: "2.5",
                    },
                  },
                  relationships: {
                    base_token: {
                      data: {
                        id: `solana_${context.metricSnapshotGapMint}`,
                        type: "token",
                      },
                    },
                    quote_token: {
                      data: {
                        id: "solana_So11111111111111111111111111111111111111112",
                        type: "token",
                      },
                    },
                    dex: {
                      data: {
                        id: "pumpswap",
                        type: "dex",
                      },
                    },
                  },
                },
              ],
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );

        const watchWriteWithGap = await runCliJson<{
          dryRun: boolean;
          writeEnabled: boolean;
          watchEnabled: boolean;
          cycleCount: number;
          failedCount: number;
          skippedCount: number;
          writtenCount: number;
          items: Array<{
            status: string;
            latestObservedAt?: string;
            minGapMinutes?: number;
            writeSummary: {
              metricId: number | null;
            };
          }>;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            summary: {
              skippedCount: number;
              writtenCount: number;
            };
            items: Array<{
              status: string;
              latestObservedAt?: string;
              minGapMinutes?: number;
              writeSummary: {
                metricId: number | null;
              };
            }>;
          }>;
        }>(
          "metric snapshot geckoterminal watch write min gap",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            context.metricSnapshotGapMint,
            "--write",
            "--watch",
            "--intervalSeconds",
            "1",
            "--maxIterations",
            "2",
            "--minGapMinutes",
            "10",
          ],
          context.smokeId,
        );

        if (
          watchWriteWithGap.dryRun !== false ||
          watchWriteWithGap.writeEnabled !== true ||
          watchWriteWithGap.watchEnabled !== true ||
          watchWriteWithGap.cycleCount !== 2 ||
          watchWriteWithGap.failedCount !== 0 ||
          watchWriteWithGap.skippedCount !== 1 ||
          watchWriteWithGap.writtenCount !== 1 ||
          watchWriteWithGap.items.length !== 2 ||
          watchWriteWithGap.cycles.length !== 2 ||
          watchWriteWithGap.cycles[0]?.summary.writtenCount !== 1 ||
          watchWriteWithGap.cycles[0]?.summary.skippedCount !== 0 ||
          watchWriteWithGap.cycles[0]?.items[0]?.status !== "ok" ||
          typeof watchWriteWithGap.cycles[0]?.items[0]?.writeSummary.metricId !== "number" ||
          watchWriteWithGap.cycles[1]?.summary.writtenCount !== 0 ||
          watchWriteWithGap.cycles[1]?.summary.skippedCount !== 1 ||
          watchWriteWithGap.cycles[1]?.items[0]?.status !== "skipped_recent_metric" ||
          typeof watchWriteWithGap.cycles[1]?.items[0]?.latestObservedAt !== "string" ||
          watchWriteWithGap.cycles[1]?.items[0]?.minGapMinutes !== 10 ||
          watchWriteWithGap.cycles[1]?.items[0]?.writeSummary.metricId !== null
        ) {
          throw new Error("metric snapshot geckoterminal minGap watch returned unexpected summary");
        }

        const gapMetrics = await db.metric.findMany({
          where: {
            token: {
              mint: context.metricSnapshotGapMint,
            },
          },
          orderBy: [{ id: "asc" }],
          select: {
            source: true,
            volume24h: true,
          },
        });

        if (
          gapMetrics.length !== 1 ||
          gapMetrics[0]?.source !== "geckoterminal.token_snapshot" ||
          gapMetrics[0]?.volume24h !== 2345
        ) {
          throw new Error("metric snapshot geckoterminal minGap did not prevent duplicate append");
        }

        const watchMissingToken = await runCliJson<{
          watchEnabled: boolean;
          cycleCount: number;
          failedCount: number;
          selectedCount: number;
          okCount: number;
          skippedCount: number;
          errorCount: number;
          writtenCount: number;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            errorMessage?: string;
            summary: {
              selectedCount: number;
              okCount: number;
              skippedCount: number;
              errorCount: number;
              writtenCount: number;
            };
          }>;
        }>(
          "metric snapshot geckoterminal watch missing token",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            `${context.metricSnapshotMint}_MISSING`,
            "--watch",
            "--intervalSeconds",
            "1",
            "--maxIterations",
            "2",
          ],
          context.smokeId,
        );

        if (
          watchMissingToken.watchEnabled !== true ||
          watchMissingToken.cycleCount !== 2 ||
          watchMissingToken.failedCount !== 2 ||
          watchMissingToken.selectedCount !== 0 ||
          watchMissingToken.okCount !== 0 ||
          watchMissingToken.skippedCount !== 0 ||
          watchMissingToken.errorCount !== 0 ||
          watchMissingToken.writtenCount !== 0 ||
          watchMissingToken.cycles.length !== 2 ||
          watchMissingToken.cycles[0]?.cycle !== 1 ||
          watchMissingToken.cycles[1]?.cycle !== 2 ||
          watchMissingToken.cycles[0]?.failed !== true ||
          watchMissingToken.cycles[1]?.failed !== true ||
          !watchMissingToken.cycles[0]?.errorMessage?.includes("Token not found") ||
          !watchMissingToken.cycles[1]?.errorMessage?.includes("Token not found") ||
          watchMissingToken.cycles[0]?.summary.selectedCount !== 0 ||
          watchMissingToken.cycles[0]?.summary.skippedCount !== 0 ||
          watchMissingToken.cycles[1]?.summary.skippedCount !== 0 ||
          watchMissingToken.cycles[1]?.summary.writtenCount !== 0
        ) {
          throw new Error("metric snapshot geckoterminal watch did not continue after cycle failures");
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }
      }
    });

    await runStep("geckoterminal enrich rescore batch", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;

      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "geckoterminal enrich rescore import",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.geckoEnrichRescoreMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      await writeFile(
        context.geckoEnrichRescoreFilePath,
        `${JSON.stringify(
          {
            data: {
              id: `solana_${context.geckoEnrichRescoreMint}`,
              type: "token",
              attributes: {
                address: context.geckoEnrichRescoreMint,
                name: "smoke gecko enrich token",
                symbol: "SMGET",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      try {
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.geckoEnrichRescoreFilePath;

        const dryRun = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          selection: {
            selectedCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
            enrichWriteCount: number;
            rescoreWriteCount: number;
            notifyCandidateCount: number;
          };
          items: Array<{
            token: {
              mint: string;
              metadataStatus: string;
            };
            selectedReason: string;
            status: string;
            fetchedSnapshot?: {
              name: string | null;
              symbol: string | null;
            };
            enrichPlan?: {
              hasPatch: boolean;
              willUpdate: boolean;
              preview: {
                metadataStatus: string;
              };
            };
            rescorePreview?: {
              ready: boolean;
              scoreRank: string;
              hardRejected: boolean;
            };
            notifyCandidate: boolean;
            writeSummary: {
              dryRun: boolean;
              enrichUpdated: boolean;
              rescoreUpdated: boolean;
            };
          }>;
        }>(
          "geckoterminal enrich rescore dry-run",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--limit",
            "1",
            "--sinceMinutes",
            "5",
          ],
          context.smokeId,
        );

        if (
          dryRun.mode !== "recent_batch" ||
          dryRun.dryRun !== true ||
          dryRun.writeEnabled !== false ||
          dryRun.selection.selectedCount !== 1 ||
          dryRun.summary.selectedCount !== 1 ||
          dryRun.summary.okCount !== 1 ||
          dryRun.summary.errorCount !== 0 ||
          dryRun.summary.enrichWriteCount !== 0 ||
          dryRun.summary.rescoreWriteCount !== 0 ||
          dryRun.items.length !== 1 ||
          dryRun.items[0]?.token.mint !== context.geckoEnrichRescoreMint ||
          dryRun.items[0]?.token.metadataStatus !== "mint_only" ||
          dryRun.items[0]?.selectedReason !== "Token.createdAt" ||
          dryRun.items[0]?.status !== "ok" ||
          dryRun.items[0]?.fetchedSnapshot?.name !== "smoke gecko enrich token" ||
          dryRun.items[0]?.fetchedSnapshot?.symbol !== "SMGET" ||
          dryRun.items[0]?.enrichPlan?.hasPatch !== true ||
          dryRun.items[0]?.enrichPlan?.willUpdate !== true ||
          dryRun.items[0]?.enrichPlan?.preview.metadataStatus !== "partial" ||
          dryRun.items[0]?.rescorePreview?.ready !== true ||
          typeof dryRun.items[0]?.rescorePreview?.scoreRank !== "string" ||
          typeof dryRun.items[0]?.rescorePreview?.hardRejected !== "boolean" ||
          typeof dryRun.items[0]?.notifyCandidate !== "boolean" ||
          dryRun.items[0]?.writeSummary.dryRun !== true ||
          dryRun.items[0]?.writeSummary.enrichUpdated !== false ||
          dryRun.items[0]?.writeSummary.rescoreUpdated !== false
        ) {
          throw new Error("geckoterminal enrich rescore dry-run returned unexpected summary");
        }

        const beforeWrite = await db.token.findUnique({
          where: { mint: context.geckoEnrichRescoreMint },
          select: {
            name: true,
            symbol: true,
            metadataStatus: true,
            enrichedAt: true,
            rescoredAt: true,
          },
        });

        if (
          !beforeWrite ||
          beforeWrite.name !== null ||
          beforeWrite.symbol !== null ||
          beforeWrite.metadataStatus !== "mint_only" ||
          beforeWrite.enrichedAt !== null ||
          beforeWrite.rescoredAt !== null
        ) {
          throw new Error("geckoterminal enrich rescore dry-run unexpectedly updated the token");
        }

        const written = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          summary: {
            okCount: number;
            errorCount: number;
            enrichWriteCount: number;
            rescoreWriteCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
            enrichPlan?: {
              willUpdate: boolean;
            };
            rescorePreview?: {
              ready: boolean;
              scoreRank: string;
              hardRejected: boolean;
            };
            writeSummary: {
              dryRun: boolean;
              enrichUpdated: boolean;
              rescoreUpdated: boolean;
            };
          }>;
        }>(
          "geckoterminal enrich rescore write",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--mint",
            context.geckoEnrichRescoreMint,
            "--write",
          ],
          context.smokeId,
        );

        if (
          written.mode !== "single" ||
          written.dryRun !== false ||
          written.writeEnabled !== true ||
          written.summary.okCount !== 1 ||
          written.summary.errorCount !== 0 ||
          written.summary.enrichWriteCount !== 1 ||
          written.summary.rescoreWriteCount !== 1 ||
          written.items.length !== 1 ||
          written.items[0]?.token.mint !== context.geckoEnrichRescoreMint ||
          written.items[0]?.status !== "ok" ||
          written.items[0]?.enrichPlan?.willUpdate !== true ||
          written.items[0]?.rescorePreview?.ready !== true ||
          typeof written.items[0]?.rescorePreview?.scoreRank !== "string" ||
          typeof written.items[0]?.rescorePreview?.hardRejected !== "boolean" ||
          written.items[0]?.writeSummary.dryRun !== false ||
          written.items[0]?.writeSummary.enrichUpdated !== true ||
          written.items[0]?.writeSummary.rescoreUpdated !== true
        ) {
          throw new Error("geckoterminal enrich rescore write returned unexpected summary");
        }

        const updatedToken = await db.token.findUnique({
          where: { mint: context.geckoEnrichRescoreMint },
          select: {
            source: true,
            name: true,
            symbol: true,
            description: true,
            metadataStatus: true,
            enrichedAt: true,
            rescoredAt: true,
            normalizedText: true,
            scoreTotal: true,
            scoreRank: true,
            hardRejected: true,
          },
        });

        if (
          !updatedToken ||
          updatedToken.source !== "geckoterminal.new_pools" ||
          updatedToken.name !== "smoke gecko enrich token" ||
          updatedToken.symbol !== "SMGET" ||
          updatedToken.description !== null ||
          updatedToken.metadataStatus !== "partial" ||
          !updatedToken.enrichedAt ||
          !updatedToken.rescoredAt ||
          typeof updatedToken.normalizedText !== "string" ||
          typeof updatedToken.scoreTotal !== "number" ||
          typeof updatedToken.scoreRank !== "string" ||
          typeof updatedToken.hardRejected !== "boolean"
        ) {
          throw new Error("geckoterminal enrich rescore write did not persist expected token fields");
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }
      }
    });

    await runStep("mint-driven happy path", async () => {
      await writeFile(
        context.mintHappyPathFilePath,
        `${JSON.stringify(
          {
            source: "smoke-happy-path-source",
            eventType: "token_detected",
            detectedAt: "2026-04-13T00:00:00.000Z",
            payload: {
              mintAddress: context.mintHappyPathMint,
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const imported = await runCliJson<{
        handoffPayload: {
          mint: string;
          source: string;
        };
        result: {
          mint: string;
          metadataStatus: string;
          created: boolean;
        };
      }>(
        "mint-driven happy path import",
        "src/cli/importMintSourceFile.ts",
        [
          "--file",
          context.mintHappyPathFilePath,
        ],
        context.smokeId,
      );

      if (
        imported.handoffPayload.mint !== context.mintHappyPathMint ||
        imported.handoffPayload.source !== "smoke-happy-path-source"
      ) {
        throw new Error("mint-driven happy path import returned unexpected handoff payload");
      }

      if (
        imported.result.mint !== context.mintHappyPathMint ||
        imported.result.metadataStatus !== "mint_only" ||
        imported.result.created !== true
      ) {
        throw new Error("mint-driven happy path import returned unexpected result");
      }

      const importedToken = await db.token.findUnique({
        where: { mint: context.mintHappyPathMint },
        select: {
          mint: true,
          source: true,
          metadataStatus: true,
          enrichedAt: true,
        },
      });

      if (!importedToken) {
        throw new Error("mint-driven happy path did not create a token");
      }

      if (importedToken.source !== "smoke-happy-path-source") {
        throw new Error("mint-driven happy path did not persist source");
      }

      if (importedToken.metadataStatus !== "mint_only") {
        throw new Error("mint-driven happy path did not persist mint_only status");
      }

      if (importedToken.enrichedAt !== null) {
        throw new Error("mint-driven happy path mint-only token unexpectedly had enrichedAt");
      }

      const sourceOnlyPatched = await runCliJson<{
        mint: string;
        source: string | null;
        metadataStatus: string;
        enrichedAt: string | null;
      }>(
        "mint-driven happy path source-only enrich patch",
        "src/cli/tokenEnrich.ts",
        [
          "--mint",
          context.mintHappyPathMint,
          "--source",
          "smoke-happy-path-source-patched",
        ],
        context.smokeId,
      );

      if (
        sourceOnlyPatched.mint !== context.mintHappyPathMint ||
        sourceOnlyPatched.source !== "smoke-happy-path-source-patched" ||
        sourceOnlyPatched.metadataStatus !== "mint_only" ||
        sourceOnlyPatched.enrichedAt !== null
      ) {
        throw new Error("mint-driven happy path source-only enrich patch returned unexpected fields");
      }

      const sourceOnlyPatchedToken = await db.token.findUnique({
        where: { mint: context.mintHappyPathMint },
        select: {
          enrichedAt: true,
        },
      });

      if (!sourceOnlyPatchedToken) {
        throw new Error("mint-driven happy path source-only enrich patch did not keep the token");
      }

      if (sourceOnlyPatchedToken.enrichedAt !== null) {
        throw new Error("mint-driven happy path source-only enrich patch unexpectedly changed enrichedAt");
      }

      const sourceOnlyPatchedShow = await runCliJson<{
        mint: string;
        source: string | null;
        metadataStatus: string;
        normalizedText: string | null;
      }>(
        "mint-driven happy path source-only enrich patch show",
        "src/cli/tokenShow.ts",
        [
          "--mint",
          context.mintHappyPathMint,
        ],
        context.smokeId,
      );

      if (
        sourceOnlyPatchedShow.mint !== context.mintHappyPathMint ||
        sourceOnlyPatchedShow.source !== "smoke-happy-path-source-patched" ||
        sourceOnlyPatchedShow.metadataStatus !== "mint_only" ||
        sourceOnlyPatchedShow.normalizedText !== null
      ) {
        throw new Error("mint-driven happy path source-only enrich patch did not preserve mint-only state");
      }

      const enriched = await runCliJson<{
        mint: string;
        name: string;
        symbol: string;
        description: string | null;
        source: string | null;
        metadataStatus: string;
      }>(
        "mint-driven happy path enrich",
        "src/cli/tokenEnrich.ts",
        [
          "--mint",
          context.mintHappyPathMint,
          "--name",
          "smoke happy path token",
          "--symbol",
          "SMKHP",
          "--desc",
          "smoke happy path enrich",
        ],
        context.smokeId,
      );

      if (
        enriched.mint !== context.mintHappyPathMint ||
        enriched.name !== "smoke happy path token" ||
        enriched.symbol !== "SMKHP" ||
        enriched.description !== "smoke happy path enrich"
      ) {
        throw new Error("mint-driven happy path enrich returned unexpected fields");
      }

      if (
        enriched.source !== "smoke-happy-path-source-patched" ||
        enriched.metadataStatus !== "enriched"
      ) {
        throw new Error("mint-driven happy path enrich returned unexpected status or source");
      }

      const patched = await runCliJson<{
        mint: string;
        name: string;
        symbol: string;
        description: string | null;
        source: string | null;
        metadataStatus: string;
      }>(
        "mint-driven happy path enrich patch",
        "src/cli/tokenEnrich.ts",
        [
          "--mint",
          context.mintHappyPathMint,
          "--desc",
          "smoke happy path enrich patch",
        ],
        context.smokeId,
      );

      if (
        patched.mint !== context.mintHappyPathMint ||
        patched.name !== "smoke happy path token" ||
        patched.symbol !== "SMKHP" ||
        patched.description !== "smoke happy path enrich patch"
      ) {
        throw new Error("mint-driven happy path enrich patch returned unexpected fields");
      }

      if (
        patched.source !== "smoke-happy-path-source-patched" ||
        patched.metadataStatus !== "enriched"
      ) {
        throw new Error("mint-driven happy path enrich patch returned unexpected status or source");
      }

      const rescored = await runCliJson<{
        mint: string;
        scoreTotal: number;
        scoreRank: string;
        hardRejected: boolean;
        rescoredAt: string | null;
      }>(
        "mint-driven happy path rescore",
        "src/cli/tokenRescore.ts",
        [
          "--mint",
          context.mintHappyPathMint,
        ],
        context.smokeId,
      );

      if (rescored.mint !== context.mintHappyPathMint) {
        throw new Error("mint-driven happy path rescore returned unexpected mint");
      }

      if (
        typeof rescored.scoreTotal !== "number" ||
        typeof rescored.scoreRank !== "string" ||
        typeof rescored.hardRejected !== "boolean" ||
        !rescored.rescoredAt
      ) {
        throw new Error("mint-driven happy path rescore did not return score fields");
      }

      const metric = await runCliJson<{
        id: number;
        mint: string;
        source: string;
        peakFdv24h: number | null;
        volume24h: number | null;
      }>(
        "mint-driven happy path metric",
        "src/cli/metricAdd.ts",
        [
          "--mint",
          context.mintHappyPathMint,
          "--source",
          "smoke-happy-path-metric",
          "--peakFdv24h",
          "180000",
          "--volume24h",
          "42000",
        ],
        context.smokeId,
      );

      if (
        metric.mint !== context.mintHappyPathMint ||
        metric.source !== "smoke-happy-path-metric" ||
        metric.peakFdv24h !== 180000 ||
        metric.volume24h !== 42000
      ) {
        throw new Error("mint-driven happy path metric:add returned unexpected fields");
      }

      const compared = await runCliJson<{
        mint: string;
        currentToken: {
          source: string | null;
          name: string | null;
          symbol: string | null;
          scoreTotal: number | null;
          scoreRank: string | null;
        };
        metricsCount: number;
        latestMetric: {
          id: number;
          source: string | null;
          peakFdv24h: number | null;
          volume24h: number | null;
        } | null;
      }>(
        "mint-driven happy path compare",
        "src/cli/tokenCompare.ts",
        [
          "--mint",
          context.mintHappyPathMint,
        ],
        context.smokeId,
      );

      if (compared.mint !== context.mintHappyPathMint) {
        throw new Error("mint-driven happy path compare returned unexpected mint");
      }

      if (
        compared.currentToken.source !== "smoke-happy-path-source-patched" ||
        compared.currentToken.name !== "smoke happy path token" ||
        compared.currentToken.symbol !== "SMKHP"
      ) {
        throw new Error("mint-driven happy path compare did not reflect enriched fields");
      }

      if (
        compared.currentToken.scoreTotal !== rescored.scoreTotal ||
        compared.currentToken.scoreRank !== rescored.scoreRank
      ) {
        throw new Error("mint-driven happy path compare did not reflect rescored fields");
      }

      if (compared.metricsCount !== 1 || !compared.latestMetric) {
        throw new Error("mint-driven happy path compare did not reflect appended metric");
      }

      if (
        compared.latestMetric.source !== "smoke-happy-path-metric" ||
        compared.latestMetric.peakFdv24h !== 180000 ||
        compared.latestMetric.volume24h !== 42000
      ) {
        throw new Error("mint-driven happy path compare returned unexpected latestMetric");
      }
    });

    await runStep("minimal import", async () => {
      const parsed = await runCliJson<{ mint: string }>(
        "minimal import",
        "src/cli/importMin.ts",
        [
          "--mint",
          context.minMint,
          "--name",
          "smoke token minimal",
          "--symbol",
          "SMKN",
          "--source",
          "smoke-test",
          "--desc",
          "minimal wrapper path",
          "--dev",
          context.devWallet,
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.minMint) {
        throw new Error("minimal import returned unexpected mint");
      }

      const token = await db.token.findUnique({
        where: { mint: context.minMint },
        include: {
          dev: {
            select: {
              wallet: true,
            },
          },
        },
      });
      if (!token) {
        throw new Error("minimal import token was not saved");
      }

      if (token.source !== "smoke-test") {
        throw new Error("minimal import did not persist source");
      }

      if (token.dev?.wallet !== context.devWallet) {
        throw new Error("minimal import did not persist dev wallet");
      }
    });

    await runStep("file import", async () => {
      await writeFile(
        context.fileImportPath,
        `${JSON.stringify(
          {
            mint: context.fileMint,
            name: "smoke token file",
            symbol: "SMKF",
            source: "smoke-test",
            desc: "file wrapper path",
            dev: context.devWallet,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const parsed = await runCliJson<{ mint: string }>(
        "file import",
        "src/cli/importFile.ts",
        [
          "--file",
          context.fileImportPath,
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.fileMint) {
        throw new Error("file import returned unexpected mint");
      }

      const token = await db.token.findUnique({
        where: { mint: context.fileMint },
        include: {
          dev: {
            select: {
              wallet: true,
            },
          },
        },
      });
      if (!token) {
        throw new Error("file import token was not saved");
      }

      if (token.description !== "file wrapper path") {
        throw new Error("file import did not persist description");
      }

      if (token.dev?.wallet !== context.devWallet) {
        throw new Error("file import did not persist dev wallet");
      }
    });

    await runStep("metric import", async () => {
      const parsed = await runCliJson<{ mint: string }>(
        "metric import",
        "src/cli/import.ts",
        [
          "--mint",
          context.metricMint,
          "--name",
          "smoke token metric",
          "--symbol",
          "SMKM",
          "--source",
          "smoke-test",
          "--dev",
          context.devWallet,
          "--maxMultiple15m",
          "2.4",
          "--peakFdv24h",
          "180000",
          "--volume24h",
          "42000",
          "--peakFdv7d",
          "240000",
          "--volume7d",
          "96000",
          "--metricSource",
          "smoke-test",
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.metricMint) {
        throw new Error("metric import returned unexpected mint");
      }

      const metricToken = await db.token.findUnique({
        where: { mint: context.metricMint },
        include: {
          metrics: {
            orderBy: [{ observedAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      });

      if (!metricToken || metricToken.metrics.length === 0) {
        throw new Error("metric import did not save a metric row");
      }

      context.metricId = metricToken.metrics[0].id;
    });

    await runStep("metric append-only", async () => {
      const before = await db.metric.count({
        where: {
          token: {
            mint: context.metricMint,
          },
        },
      });

      const first = await runCliJson<{
        id: number;
        mint: string;
      }>(
        "metric append-only first",
        "src/cli/metricAdd.ts",
        [
          "--mint",
          context.metricMint,
          "--maxMultiple15m",
          "2.4",
          "--source",
          "smoke-test",
        ],
        context.smokeId,
      );

      const second = await runCliJson<{
        id: number;
        mint: string;
      }>(
        "metric append-only second",
        "src/cli/metricAdd.ts",
        [
          "--mint",
          context.metricMint,
          "--maxMultiple15m",
          "2.4",
          "--source",
          "smoke-test",
        ],
        context.smokeId,
      );

      if (first.mint !== context.metricMint || second.mint !== context.metricMint) {
        throw new Error("metric append-only returned unexpected mint");
      }

      if (first.id === second.id) {
        throw new Error("metric append-only reused the same metric id");
      }

      const after = await db.metric.count({
        where: {
          token: {
            mint: context.metricMint,
          },
        },
      });

      if (after !== before + 2) {
        throw new Error("metric append-only did not create two new rows");
      }

      context.metricId = second.id;
    });

    await runStep("token show", async () => {
      const mintOnly = await runCliJson<{
        mint: string;
        hasCurrentText: boolean;
        metadataStatus: string;
        latestMetric: { id: number } | null;
        enrichedAt: string | null;
        rescoredAt: string | null;
      }>(
        "token show mint-only",
        "src/cli/tokenShow.ts",
        [
          "--mint",
          context.mintOnlyMint,
        ],
        context.smokeId,
      );

      if (mintOnly.mint !== context.mintOnlyMint) {
        throw new Error("token show returned unexpected mint for mint-only token");
      }

      if (mintOnly.metadataStatus !== "mint_only") {
        throw new Error("token show did not include metadataStatus for mint-only token");
      }

      if (mintOnly.hasCurrentText !== false) {
        throw new Error("token show returned unexpected hasCurrentText for mint-only token");
      }

      if (mintOnly.latestMetric) {
        throw new Error("token show returned unexpected latestMetric for mint-only token");
      }

      if (mintOnly.enrichedAt !== null || mintOnly.rescoredAt !== null) {
        throw new Error("token show returned unexpected enrich/rescore timestamps for mint-only token");
      }

      const parsed = await runCliJson<{
        mint: string;
        hasCurrentText: boolean;
        metadataStatus: string;
        latestMetric: { id: number } | null;
        enrichedAt: string | null;
        rescoredAt: string | null;
      }>(
        "token show",
        "src/cli/tokenShow.ts",
        [
          "--mint",
          context.mintHappyPathMint,
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.mintHappyPathMint) {
        throw new Error("token show returned unexpected mint");
      }

      if (parsed.metadataStatus !== "enriched") {
        throw new Error("token show did not include metadataStatus");
      }

      if (parsed.hasCurrentText !== true) {
        throw new Error("token show returned unexpected hasCurrentText for token with current text");
      }

      if (!parsed.latestMetric) {
        throw new Error("token show did not include latestMetric");
      }

      if (!parsed.enrichedAt || !parsed.rescoredAt) {
        throw new Error("token show did not include enrich/rescore timestamps for updated token");
      }
    });

    await runStep("token compare", async () => {
      const parsed = await runCliJson<{
        mint: string;
        latestMetric: { id: number } | null;
        recentMetrics: Array<{ id: number }>;
      }>(
        "token compare",
        "src/cli/tokenCompare.ts",
        [
          "--mint",
          context.metricMint,
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.metricMint) {
        throw new Error("token compare returned unexpected mint");
      }

      if (!parsed.latestMetric) {
        throw new Error("token compare did not include latestMetric");
      }

      if (parsed.recentMetrics.length === 0) {
        throw new Error("token compare did not include recentMetrics");
      }
    });

    await runStep("tokens report", async () => {
      const parsed = await runCliJson<{
        count: number;
        items: Array<{
          mint: string;
          metadataStatus: string;
          latestMetricObservedAt: string | null;
        }>;
      }>(
        "tokens report",
        "src/cli/tokensReport.ts",
        [
          "--source",
          "smoke-test",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (parsed.count === 0) {
        throw new Error("tokens report returned no rows");
      }

      const reportItem = parsed.items.find((item) => item.mint === context.metricMint);
      if (!reportItem) {
        throw new Error("tokens report did not include metric token");
      }

      if (reportItem.metadataStatus !== "mint_only") {
        throw new Error("tokens report returned unexpected metadataStatus");
      }

      if (!reportItem.latestMetricObservedAt) {
        throw new Error("tokens report did not include latestMetricObservedAt");
      }

      const filteredByMetadataStatus = await runCliJson<{
        count: number;
        filters: {
          metadataStatus: string | null;
        };
        items: Array<{
          metadataStatus: string;
        }>;
      }>(
        "tokens report metadata status",
        "src/cli/tokensReport.ts",
        [
          "--metadataStatus",
          "mint_only",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (filteredByMetadataStatus.filters.metadataStatus !== "mint_only") {
        throw new Error("tokens report did not echo metadataStatus filter");
      }

      if (
        filteredByMetadataStatus.items.some(
          (item) => item.metadataStatus !== "mint_only",
        )
      ) {
        throw new Error(
          "tokens report metadataStatus filter returned rows with a different status",
        );
      }

      const filteredByHasMetrics = await runCliJson<{
        count: number;
        filters: {
          hasMetrics: boolean | null;
        };
        items: Array<{
          mint: string;
          latestMetricObservedAt: string | null;
          metricsCount: number;
        }>;
      }>(
        "tokens report has metrics",
        "src/cli/tokensReport.ts",
        [
          "--hasMetrics",
          "false",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (filteredByHasMetrics.filters.hasMetrics !== false) {
        throw new Error("tokens report did not echo hasMetrics filter");
      }

      if (
        filteredByHasMetrics.items.some(
          (item) =>
            item.latestMetricObservedAt !== null || item.metricsCount !== 0,
        )
      ) {
        throw new Error(
          "tokens report hasMetrics=false filter returned rows that already have metrics",
        );
      }

      const createdAfter = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const filteredByCreatedAfter = await runCliJson<{
        count: number;
        filters: {
          createdAfter: string | null;
        };
        items: Array<{
          mint: string;
          createdAt: string;
          updatedAt: string;
          enrichedAt: string | null;
          rescoredAt: string | null;
        }>;
      }>(
        "tokens report created after",
        "src/cli/tokensReport.ts",
        [
          "--createdAfter",
          createdAfter,
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (filteredByCreatedAfter.filters.createdAfter !== createdAfter) {
        throw new Error("tokens report did not echo createdAfter filter");
      }

      if (
        filteredByCreatedAfter.items.some(
          (item) => new Date(item.createdAt).getTime() < new Date(createdAfter).getTime(),
        )
      ) {
        throw new Error(
          "tokens report createdAfter filter returned rows created before the requested timestamp",
        );
      }

      if (
        filteredByCreatedAfter.items.some(
          (item) => typeof item.updatedAt !== "string" || Number.isNaN(new Date(item.updatedAt).getTime()),
        )
      ) {
        throw new Error("tokens report did not include a valid updatedAt");
      }

      const mintOnlyReportItem = filteredByCreatedAfter.items.find(
        (item) => item.mint === context.metricMint,
      );
      if (!mintOnlyReportItem) {
        throw new Error("tokens report createdAfter check did not include mint-only metric token");
      }
      if (mintOnlyReportItem.enrichedAt !== null || mintOnlyReportItem.rescoredAt !== null) {
        throw new Error("tokens report mint-only row unexpectedly included enrich/rescore timestamps");
      }

      const enrichedReportItem = filteredByCreatedAfter.items.find(
        (item) => item.mint === context.mintHappyPathMint,
      );
      if (!enrichedReportItem) {
        throw new Error("tokens report createdAfter check did not include enriched smoke token");
      }
      if (!enrichedReportItem.enrichedAt || !enrichedReportItem.rescoredAt) {
        throw new Error("tokens report enriched/rescored row did not include enrich/rescore timestamps");
      }
    });

    await runStep("tokens compare report", async () => {
      const parsed = await runCliJson<{
        count: number;
        items: Array<{
          mint: string;
          entryVsCurrentChanged: boolean;
          changedFields: string[];
          changedFieldsCount: number;
          latestMetricObservedAt: string | null;
        }>;
      }>(
        "tokens compare report",
        "src/cli/tokensCompareReport.ts",
        [
          "--source",
          "smoke-test",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (parsed.count === 0) {
        throw new Error("tokens compare report returned no rows");
      }

      const reportItem = parsed.items.find((item) => item.mint === context.metricMint);
      if (!reportItem) {
        throw new Error("tokens compare report did not include metric token");
      }

      if (!reportItem.latestMetricObservedAt) {
        throw new Error("tokens compare report did not include latest metric summary");
      }

      if (typeof reportItem.entryVsCurrentChanged !== "boolean") {
        throw new Error("tokens compare report did not include entryVsCurrentChanged");
      }

      if (!Number.isInteger(reportItem.changedFieldsCount)) {
        throw new Error("tokens compare report did not include changedFieldsCount");
      }

      if (!Array.isArray(reportItem.changedFields)) {
        throw new Error("tokens compare report did not include changedFields");
      }

      if (reportItem.changedFields.length !== reportItem.changedFieldsCount) {
        throw new Error(
          "tokens compare report changedFields length did not match changedFieldsCount",
        );
      }

      const changedOnly = await runCliJson<{
        count: number;
        items: Array<{
          entryVsCurrentChanged: boolean;
        }>;
      }>(
        "tokens compare report changed only",
        "src/cli/tokensCompareReport.ts",
        [
          "--source",
          "smoke-test",
          "--entryVsCurrentChanged",
          "true",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (
        changedOnly.items.some(
          (item) => item.entryVsCurrentChanged !== true,
        )
      ) {
        throw new Error(
          "tokens compare report entryVsCurrentChanged filter returned unchanged rows",
        );
      }

      const sortedByChangedFields = await runCliJson<{
        count: number;
        items: Array<{
          changedFieldsCount: number;
        }>;
      }>(
        "tokens compare report sort by changed fields",
        "src/cli/tokensCompareReport.ts",
        [
          "--source",
          "smoke-test",
          "--sortBy",
          "changedFieldsCount",
          "--sortOrder",
          "desc",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      for (let i = 1; i < sortedByChangedFields.items.length; i += 1) {
        if (
          sortedByChangedFields.items[i - 1].changedFieldsCount <
          sortedByChangedFields.items[i].changedFieldsCount
        ) {
          throw new Error(
            "tokens compare report changedFieldsCount sort returned out-of-order rows",
          );
        }
      }

      const changedThreshold = await runCliJson<{
        count: number;
        items: Array<{
          changedFieldsCount: number;
        }>;
      }>(
        "tokens compare report min changed fields",
        "src/cli/tokensCompareReport.ts",
        [
          "--source",
          "smoke-test",
          "--minChangedFieldsCount",
          "4",
          "--sortBy",
          "changedFieldsCount",
          "--sortOrder",
          "desc",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (
        changedThreshold.items.some(
          (item) => item.changedFieldsCount < 4,
        )
      ) {
        throw new Error(
          "tokens compare report minChangedFieldsCount filter returned rows below the threshold",
        );
      }

      const changedFieldOnly = await runCliJson<{
        count: number;
        items: Array<{
          changedFields: string[];
        }>;
      }>(
        "tokens compare report changed field",
        "src/cli/tokensCompareReport.ts",
        [
          "--source",
          "smoke-test",
          "--changedField",
          "scoreRank",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      if (
        changedFieldOnly.items.some(
          (item) => !item.changedFields.includes("scoreRank"),
        )
      ) {
        throw new Error(
          "tokens compare report changedField filter returned rows without the requested field",
        );
      }
    });

    await runStep("metric show", async () => {
      if (context.metricId === null) {
        throw new Error("metric show missing smoke metric id");
      }

      const parsed = await runCliJson<{
        id: number;
        token: { mint: string };
      }>(
        "metric show",
        "src/cli/metricShow.ts",
        [
          "--id",
          String(context.metricId),
        ],
        context.smokeId,
      );

      if (parsed.id !== context.metricId) {
        throw new Error("metric show returned unexpected id");
      }

      if (parsed.token.mint !== context.metricMint) {
        throw new Error("metric show returned unexpected token mint");
      }
    });

    await runStep("trend update", async () => {
      const parsed = await runCliJson<{
        generatedAt: string;
        keywords: string[];
      }>(
        "trend update",
        "src/cli/updateTrend.ts",
        [
          "--keywords",
          `${context.smokeId.toLowerCase()}_alpha,${context.smokeId.toLowerCase()}_beta`,
        ],
        context.smokeId,
      );

      if (parsed.generatedAt === context.trendGeneratedAt) {
        throw new Error("trend generatedAt did not change");
      }

      const updatedTrend = JSON.parse(await readFile(TREND_PATH, "utf-8")) as {
        generatedAt: string;
        keywords: Array<{ keyword: string }>;
      };

      const keywords = updatedTrend.keywords.map((entry) => entry.keyword);
      if (!keywords.includes(`${context.smokeId.toLowerCase()}_alpha`)) {
        throw new Error("trend update did not persist smoke keywords");
      }
    });

    await runStep("metrics report", async () => {
      const parsed = await runCliJson<{
        count: number;
        items: Array<{
          token: { mint: string };
          peakFdv7d: number | null;
          volume7d: number | null;
        }>;
      }>(
        "metrics report",
        "src/cli/metricsReport.ts",
        [
          "--mint",
          context.metricMint,
          "--limit",
          "5",
        ],
        context.smokeId,
      );

      if (parsed.count < 1) {
        throw new Error("metrics report returned no rows");
      }

      if (!parsed.items.some((item) => item.token.mint === context.metricMint)) {
        throw new Error("metrics report did not include the smoke metric token");
      }

      const with7d = await runCliJson<{
        count: number;
        items: Array<{
          peakFdv7d: number | null;
          volume7d: number | null;
        }>;
      }>(
        "metrics report with 7d presence",
        "src/cli/metricsReport.ts",
        [
          "--mint",
          context.metricMint,
          "--hasPeakFdv7d",
          "true",
          "--hasVolume7d",
          "true",
          "--limit",
          "5",
        ],
        context.smokeId,
      );

      if (with7d.count < 1) {
        throw new Error("metrics report 7d presence filter returned no rows");
      }

      if (
        with7d.items.some(
          (item) => item.peakFdv7d === null || item.volume7d === null,
        )
      ) {
        throw new Error(
          "metrics report 7d presence filter returned rows missing 7d values",
        );
      }

      const sortedByPeakFdv7d = await runCliJson<{
        count: number;
        items: Array<{
          peakFdv7d: number | null;
        }>;
      }>(
        "metrics report sort by peak fdv 7d",
        "src/cli/metricsReport.ts",
        [
          "--hasPeakFdv7d",
          "true",
          "--sortBy",
          "peakFdv7d",
          "--sortOrder",
          "desc",
          "--limit",
          "10",
        ],
        context.smokeId,
      );

      for (let i = 1; i < sortedByPeakFdv7d.items.length; i += 1) {
        if (
          (sortedByPeakFdv7d.items[i - 1].peakFdv7d ?? -Infinity) <
          (sortedByPeakFdv7d.items[i].peakFdv7d ?? -Infinity)
        ) {
          throw new Error(
            "metrics report peakFdv7d sort returned out-of-order rows",
          );
        }
      }
    });

    logStep("done");
  } finally {
    await restoreTrend(context.trendRaw);
    await cleanup(context);
    await db.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
