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
  geckoterminalDetectRunnerRetryMint: string;
  geckoterminalDetectRunnerTimeoutRetryMint: string;
  geckoterminalDetectRunnerCooldownMint: string;
  detectRunnerCheckpointMint: string;
  detectRunnerIdleLogMint: string;
  mintHappyPathMint: string;
  minMint: string;
  fileMint: string;
  metricMint: string;
  metricSnapshotMint: string;
  metricSnapshotGapMint: string;
  metricSnapshotPumpMint: string;
  metricSnapshotNonPumpMint: string;
  metricSnapshotRateLimitMints: [string, string];
  geckoEnrichRescoreRateLimitMints: [string, string];
  geckoEnrichRescoreMint: string;
  geckoEnrichRescoreCompleteMint: string;
  geckoEnrichRescorePumpMint: string;
  geckoEnrichRescoreNonPumpMint: string;
  geckoContextCapturePumpMint: string;
  geckoContextCaptureNonPumpMint: string;
  dexscreenerContextCompareFilePath: string;
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
  geckoterminalDetectRunnerRetryCheckpointPath: string;
  geckoterminalDetectRunnerTimeoutRetryCheckpointPath: string;
  geckoterminalDetectRunnerCooldownCheckpointPath: string;
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
  geckoContextCaptureFilePath: string;
  telegramCaptureFilePath: string;
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
          context.geckoterminalDetectRunnerRetryMint,
          context.geckoterminalDetectRunnerTimeoutRetryMint,
          context.geckoterminalDetectRunnerCooldownMint,
          context.detectRunnerCheckpointMint,
          context.detectRunnerIdleLogMint,
          context.mintHappyPathMint,
          context.minMint,
          context.fileMint,
          context.metricMint,
          context.metricSnapshotMint,
          context.metricSnapshotGapMint,
          context.metricSnapshotPumpMint,
          context.metricSnapshotNonPumpMint,
          ...context.metricSnapshotRateLimitMints,
          ...context.geckoEnrichRescoreRateLimitMints,
          context.geckoEnrichRescoreMint,
          context.geckoEnrichRescoreCompleteMint,
          context.geckoEnrichRescorePumpMint,
          context.geckoEnrichRescoreNonPumpMint,
          context.geckoContextCapturePumpMint,
          context.geckoContextCaptureNonPumpMint,
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
          context.geckoterminalDetectRunnerMint,
          context.geckoterminalDetectRunnerRetryMint,
          context.detectRunnerCheckpointMint,
          context.detectRunnerIdleLogMint,
          context.mintHappyPathMint,
          context.minMint,
          context.fileMint,
          context.metricMint,
          context.metricSnapshotMint,
          context.metricSnapshotGapMint,
          context.metricSnapshotPumpMint,
          context.metricSnapshotNonPumpMint,
          ...context.metricSnapshotRateLimitMints,
          ...context.geckoEnrichRescoreRateLimitMints,
          context.geckoEnrichRescoreMint,
          context.geckoEnrichRescoreCompleteMint,
          context.geckoEnrichRescorePumpMint,
          context.geckoEnrichRescoreNonPumpMint,
          context.geckoContextCapturePumpMint,
          context.geckoContextCaptureNonPumpMint,
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
  await rm(context.geckoterminalDetectRunnerRetryCheckpointPath, { force: true });
  await rm(context.geckoterminalDetectRunnerTimeoutRetryCheckpointPath, { force: true });
  await rm(context.geckoterminalDetectRunnerCooldownCheckpointPath, { force: true });
  await rm(context.detectRunnerIdleLogFilePath, { force: true });
  await rm(context.detectRunnerIdleLogCheckpointPath, { force: true });
  await rm(context.detectRunnerInvalidFilePath, { force: true });
  await rm(context.detectRunnerInvalidCheckpointPath, { force: true });
  await rm(context.mintHappyPathFilePath, { force: true });
  await rm(context.metricSnapshotFilePath, { force: true });
  await rm(context.geckoEnrichRescoreFilePath, { force: true });
  await rm(context.geckoContextCaptureFilePath, { force: true });
  await rm(context.dexscreenerContextCompareFilePath, { force: true });
  await rm(context.telegramCaptureFilePath, { force: true });
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
    geckoterminalDetectRunnerRetryMint: `N${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "7").padEnd(43, "8").slice(0, 43)}`,
    geckoterminalDetectRunnerTimeoutRetryMint: `Q${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "9").padEnd(43, "A").slice(0, 43)}`,
    geckoterminalDetectRunnerCooldownMint: `P${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "8").padEnd(43, "9").slice(0, 43)}`,
    detectRunnerCheckpointMint: `J${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "3").padEnd(43, "4").slice(0, 43)}`,
    detectRunnerIdleLogMint: `K${smokeId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "4").padEnd(43, "5").slice(0, 43)}`,
    mintHappyPathMint: `${smokeId}_HAPPY_PATH`,
    minMint: `${smokeId}_MIN`,
    fileMint: `${smokeId}_FILE`,
    metricMint: `${smokeId}_METRIC`,
    metricSnapshotMint: `${smokeId}_METRIC_SNAPSHOT`,
    metricSnapshotGapMint: `${smokeId}_METRIC_SNAPSHOT_GAP`,
    metricSnapshotPumpMint: `${smokeId}_METRIC_SNAPSHOT_FASTpump`,
    metricSnapshotNonPumpMint: `${smokeId}_METRIC_SNAPSHOT_FAST_NON_PUMP`,
    metricSnapshotRateLimitMints: [
      `${smokeId}_METRIC_SNAPSHOT_RATE_LIMIT_1`,
      `${smokeId}_METRIC_SNAPSHOT_RATE_LIMIT_2`,
    ],
    geckoEnrichRescoreRateLimitMints: [
      `${smokeId}_GECKO_ENRICH_RATE_LIMIT_1`,
      `${smokeId}_GECKO_ENRICH_RATE_LIMIT_2`,
    ],
    geckoEnrichRescoreMint: `${smokeId}_GECKO_ENRICH_RESCORE`,
    geckoEnrichRescoreCompleteMint: `${smokeId}_GECKO_ENRICH_RESCORE_COMPLETE`,
    geckoEnrichRescorePumpMint: `${smokeId}_GECKO_ENRICH_RESCORE_FASTpump`,
    geckoEnrichRescoreNonPumpMint: `${smokeId}_GECKO_ENRICH_RESCORE_FAST_NON_PUMP`,
    geckoContextCapturePumpMint: `${smokeId}_GECKO_CONTEXT_CAPTUREpump`,
    geckoContextCaptureNonPumpMint: `${smokeId}_GECKO_CONTEXT_CAPTURE_NON_PUMP`,
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
    geckoterminalDetectRunnerRetryCheckpointPath: `/tmp/${smokeId}-detect-geckoterminal-retry-checkpoint.json`,
    geckoterminalDetectRunnerTimeoutRetryCheckpointPath: `/tmp/${smokeId}-detect-geckoterminal-timeout-retry-checkpoint.json`,
    geckoterminalDetectRunnerCooldownCheckpointPath: `/tmp/${smokeId}-detect-geckoterminal-cooldown-checkpoint.json`,
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
    geckoContextCaptureFilePath: `/tmp/${smokeId}-gecko-context-capture.json`,
    dexscreenerContextCompareFilePath: `/tmp/${smokeId}-dexscreener-context-compare.json`,
    telegramCaptureFilePath: `/tmp/${smokeId}-telegram-capture.jsonl`,
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

      const previousGeckoApiUrl = process.env.GECKOTERMINAL_NEW_POOLS_API_URL;
      const previousGeckoFetchError =
        process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE;
      const previousGeckoFetchErrorCount =
        process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_COUNT;
      const previousGeckoFailureCooldownSeconds =
        process.env.LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS;
      const retryPayload = {
        data: [
          {
            id: "solana_retry_pool",
            type: "pool",
            attributes: {
              address: "retryPoolAddress11111111111111111111111111111111",
              name: "GECKORETRY / SOL",
              pool_created_at: "2026-04-18T03:35:54Z",
            },
            relationships: {
              base_token: {
                data: {
                  id: `solana_${context.geckoterminalDetectRunnerRetryMint}`,
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
            id: `solana_${context.geckoterminalDetectRunnerRetryMint}`,
            type: "token",
            attributes: {
              address: context.geckoterminalDetectRunnerRetryMint,
              symbol: "GECKORT",
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
      };

      try {
        process.env.GECKOTERMINAL_NEW_POOLS_API_URL =
          `data:application/json,${encodeURIComponent(JSON.stringify(retryPayload))}`;
        process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE =
          "GeckoTerminal request failed: 429 Too Many Requests";

        const watchedRetry = await runCliJsonWithStderr<{
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
          acceptedCount: number;
          importedCount: number;
          existingCount: number;
          rateLimitRetryCount: number;
          rateLimitRetrySuccessCount: number;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            rateLimitRetried: boolean;
            rateLimitRetrySucceeded: boolean;
            processedCount: number;
            importedCount: number;
            checkpointAfter?: {
              poolCreatedAt: string;
              poolAddress: string;
            };
          }>;
        }>(
          "detect geckoterminal watch retry on rate limit",
          "src/cli/detectGeckoterminalNewPools.ts",
          [
            "--write",
            "--watch",
            "--maxIterations",
            "1",
            "--checkpointFile",
            context.geckoterminalDetectRunnerRetryCheckpointPath,
          ],
          context.smokeId,
        );

        if (
          watchedRetry.parsed.checkpointEnabled !== true ||
          watchedRetry.parsed.checkpointBefore !== undefined ||
          watchedRetry.parsed.checkpointAfter?.poolCreatedAt !== "2026-04-18T03:35:54.000Z" ||
          watchedRetry.parsed.checkpointAfter?.poolAddress !==
            "retryPoolAddress11111111111111111111111111111111" ||
          watchedRetry.parsed.checkpointUpdated !== true ||
          watchedRetry.parsed.failedCount !== 0 ||
          watchedRetry.parsed.processedCount !== 1 ||
          watchedRetry.parsed.acceptedCount !== 1 ||
          watchedRetry.parsed.importedCount !== 1 ||
          watchedRetry.parsed.existingCount !== 0 ||
          watchedRetry.parsed.rateLimitRetryCount !== 1 ||
          watchedRetry.parsed.rateLimitRetrySuccessCount !== 1 ||
          watchedRetry.parsed.cycles.length !== 1 ||
          watchedRetry.parsed.cycles[0]?.failed !== false ||
          watchedRetry.parsed.cycles[0]?.rateLimitRetried !== true ||
          watchedRetry.parsed.cycles[0]?.rateLimitRetrySucceeded !== true ||
          watchedRetry.parsed.cycles[0]?.processedCount !== 1 ||
          watchedRetry.parsed.cycles[0]?.importedCount !== 1 ||
          watchedRetry.parsed.cycles[0]?.checkpointAfter?.poolCreatedAt !==
            "2026-04-18T03:35:54.000Z"
        ) {
          throw new Error("detect geckoterminal watch retry returned unexpected summary");
        }

        if (
          !watchedRetry.stderr.includes("rateLimitRetried=true") ||
          !watchedRetry.stderr.includes("rateLimitRetrySucceeded=true")
        ) {
          throw new Error("detect geckoterminal watch retry did not log expected stderr summary");
        }

        const retryCheckpointRaw = await readFile(
          context.geckoterminalDetectRunnerRetryCheckpointPath,
          "utf-8",
        );
        const retryCheckpointParsed = JSON.parse(retryCheckpointRaw) as {
          source?: string;
          cursor?: {
            poolCreatedAt?: string;
            poolAddress?: string;
          };
        };

        if (
          retryCheckpointParsed.source !== "geckoterminal.new_pools" ||
          retryCheckpointParsed.cursor?.poolCreatedAt !== "2026-04-18T03:35:54.000Z" ||
          retryCheckpointParsed.cursor?.poolAddress !==
            "retryPoolAddress11111111111111111111111111111111"
        ) {
          throw new Error("detect geckoterminal retry checkpoint file did not persist the expected cursor");
        }

        const timeoutRetryPayload = {
          data: [
            {
              id: "solana_timeout_retry_pool",
              type: "pool",
              attributes: {
                address: "timeoutRetryPoolAddress1111111111111111111111111",
                name: "GECKOTIMEOUT / SOL",
                pool_created_at: "2026-04-18T03:45:54Z",
              },
              relationships: {
                base_token: {
                  data: {
                    id: `solana_${context.geckoterminalDetectRunnerTimeoutRetryMint}`,
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
              id: `solana_${context.geckoterminalDetectRunnerTimeoutRetryMint}`,
              type: "token",
              attributes: {
                address: context.geckoterminalDetectRunnerTimeoutRetryMint,
                symbol: "GECKOTO",
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
        };

        process.env.GECKOTERMINAL_NEW_POOLS_API_URL =
          `data:application/json,${encodeURIComponent(JSON.stringify(timeoutRetryPayload))}`;
        process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE =
          "The operation was aborted due to timeout";

        const watchedTimeoutRetry = await runCliJsonWithStderr<{
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
          acceptedCount: number;
          importedCount: number;
          existingCount: number;
          rateLimitRetryCount: number;
          rateLimitRetrySuccessCount: number;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            rateLimitRetried: boolean;
            rateLimitRetrySucceeded: boolean;
            processedCount: number;
            importedCount: number;
            checkpointAfter?: {
              poolCreatedAt: string;
              poolAddress: string;
            };
          }>;
        }>(
          "detect geckoterminal watch retry on timeout",
          "src/cli/detectGeckoterminalNewPools.ts",
          [
            "--write",
            "--watch",
            "--maxIterations",
            "1",
            "--checkpointFile",
            context.geckoterminalDetectRunnerTimeoutRetryCheckpointPath,
          ],
          context.smokeId,
        );

        if (
          watchedTimeoutRetry.parsed.checkpointEnabled !== true ||
          watchedTimeoutRetry.parsed.checkpointBefore !== undefined ||
          watchedTimeoutRetry.parsed.checkpointAfter?.poolCreatedAt !==
            "2026-04-18T03:45:54.000Z" ||
          watchedTimeoutRetry.parsed.checkpointAfter?.poolAddress !==
            "timeoutRetryPoolAddress1111111111111111111111111" ||
          watchedTimeoutRetry.parsed.checkpointUpdated !== true ||
          watchedTimeoutRetry.parsed.failedCount !== 0 ||
          watchedTimeoutRetry.parsed.processedCount !== 1 ||
          watchedTimeoutRetry.parsed.acceptedCount !== 1 ||
          watchedTimeoutRetry.parsed.importedCount !== 1 ||
          watchedTimeoutRetry.parsed.existingCount !== 0 ||
          watchedTimeoutRetry.parsed.rateLimitRetryCount !== 1 ||
          watchedTimeoutRetry.parsed.rateLimitRetrySuccessCount !== 1 ||
          watchedTimeoutRetry.parsed.cycles.length !== 1 ||
          watchedTimeoutRetry.parsed.cycles[0]?.failed !== false ||
          watchedTimeoutRetry.parsed.cycles[0]?.rateLimitRetried !== true ||
          watchedTimeoutRetry.parsed.cycles[0]?.rateLimitRetrySucceeded !== true ||
          watchedTimeoutRetry.parsed.cycles[0]?.processedCount !== 1 ||
          watchedTimeoutRetry.parsed.cycles[0]?.importedCount !== 1 ||
          watchedTimeoutRetry.parsed.cycles[0]?.checkpointAfter?.poolCreatedAt !==
            "2026-04-18T03:45:54.000Z"
        ) {
          throw new Error("detect geckoterminal timeout retry returned unexpected summary");
        }

        if (
          !watchedTimeoutRetry.stderr.includes("rateLimitRetried=true") ||
          !watchedTimeoutRetry.stderr.includes("rateLimitRetrySucceeded=true")
        ) {
          throw new Error(
            "detect geckoterminal timeout retry did not log expected stderr summary",
          );
        }

        const timeoutRetryCheckpointRaw = await readFile(
          context.geckoterminalDetectRunnerTimeoutRetryCheckpointPath,
          "utf-8",
        );
        const timeoutRetryCheckpointParsed = JSON.parse(timeoutRetryCheckpointRaw) as {
          source?: string;
          cursor?: {
            poolCreatedAt?: string;
            poolAddress?: string;
          };
        };

        if (
          timeoutRetryCheckpointParsed.source !== "geckoterminal.new_pools" ||
          timeoutRetryCheckpointParsed.cursor?.poolCreatedAt !== "2026-04-18T03:45:54.000Z" ||
          timeoutRetryCheckpointParsed.cursor?.poolAddress !==
            "timeoutRetryPoolAddress1111111111111111111111111"
        ) {
          throw new Error(
            "detect geckoterminal timeout retry checkpoint file did not persist the expected cursor",
          );
        }

        const cooldownPayload = {
          data: [
            {
              id: "solana_cooldown_pool",
              type: "pool",
              attributes: {
                address: "cooldownPoolAddress1111111111111111111111111111",
                name: "GECKOCOOLDOWN / SOL",
                pool_created_at: "2026-04-18T04:35:54Z",
              },
              relationships: {
                base_token: {
                  data: {
                    id: `solana_${context.geckoterminalDetectRunnerCooldownMint}`,
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
              id: `solana_${context.geckoterminalDetectRunnerCooldownMint}`,
              type: "token",
              attributes: {
                address: context.geckoterminalDetectRunnerCooldownMint,
                symbol: "GECKOCD",
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
        };

        process.env.GECKOTERMINAL_NEW_POOLS_API_URL =
          `data:application/json,${encodeURIComponent(JSON.stringify(cooldownPayload))}`;
        process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE =
          "GeckoTerminal request failed: 429 Too Many Requests";
        process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_COUNT = "2";
        process.env.LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS = "1";

        const watchedCooldown = await runCliJsonWithStderr<{
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
          acceptedCount: number;
          importedCount: number;
          existingCount: number;
          rateLimitRetryCount: number;
          rateLimitRetrySuccessCount: number;
          failureCooldownCount: number;
          failureCooldownSeconds: number;
          cycles: Array<{
            cycle: number;
            failed: boolean;
            errorMessage?: string;
            rateLimitRetried: boolean;
            rateLimitRetrySucceeded: boolean;
            failureCooldownApplied: boolean;
            failureCooldownSeconds: number;
            processedCount: number;
            importedCount: number;
            checkpointAfter?: {
              poolCreatedAt: string;
              poolAddress: string;
            };
          }>;
        }>(
          "detect geckoterminal watch failure cooldown",
          "src/cli/detectGeckoterminalNewPools.ts",
          [
            "--write",
            "--watch",
            "--maxIterations",
            "2",
            "--checkpointFile",
            context.geckoterminalDetectRunnerCooldownCheckpointPath,
          ],
          context.smokeId,
        );

        if (
          watchedCooldown.parsed.checkpointEnabled !== true ||
          watchedCooldown.parsed.checkpointBefore !== undefined ||
          watchedCooldown.parsed.checkpointAfter?.poolCreatedAt !== "2026-04-18T04:35:54.000Z" ||
          watchedCooldown.parsed.checkpointAfter?.poolAddress !==
            "cooldownPoolAddress1111111111111111111111111111" ||
          watchedCooldown.parsed.checkpointUpdated !== true ||
          watchedCooldown.parsed.failedCount !== 1 ||
          watchedCooldown.parsed.processedCount !== 1 ||
          watchedCooldown.parsed.acceptedCount !== 1 ||
          watchedCooldown.parsed.importedCount !== 1 ||
          watchedCooldown.parsed.existingCount !== 0 ||
          watchedCooldown.parsed.rateLimitRetryCount !== 1 ||
          watchedCooldown.parsed.rateLimitRetrySuccessCount !== 0 ||
          watchedCooldown.parsed.failureCooldownCount !== 1 ||
          watchedCooldown.parsed.failureCooldownSeconds !== 1 ||
          watchedCooldown.parsed.cycles.length !== 2 ||
          watchedCooldown.parsed.cycles[0]?.cycle !== 1 ||
          watchedCooldown.parsed.cycles[1]?.cycle !== 2 ||
          watchedCooldown.parsed.cycles[0]?.failed !== true ||
          watchedCooldown.parsed.cycles[0]?.rateLimitRetried !== true ||
          watchedCooldown.parsed.cycles[0]?.rateLimitRetrySucceeded !== false ||
          watchedCooldown.parsed.cycles[0]?.failureCooldownApplied !== true ||
          watchedCooldown.parsed.cycles[0]?.failureCooldownSeconds !== 1 ||
          !watchedCooldown.parsed.cycles[0]?.errorMessage?.includes("429 Too Many Requests") ||
          watchedCooldown.parsed.cycles[0]?.processedCount !== 0 ||
          watchedCooldown.parsed.cycles[0]?.checkpointAfter !== undefined ||
          watchedCooldown.parsed.cycles[1]?.failed !== false ||
          watchedCooldown.parsed.cycles[1]?.failureCooldownApplied !== false ||
          watchedCooldown.parsed.cycles[1]?.failureCooldownSeconds !== 0 ||
          watchedCooldown.parsed.cycles[1]?.processedCount !== 1 ||
          watchedCooldown.parsed.cycles[1]?.importedCount !== 1 ||
          watchedCooldown.parsed.cycles[1]?.checkpointAfter?.poolCreatedAt !==
            "2026-04-18T04:35:54.000Z"
        ) {
          throw new Error("detect geckoterminal watch failure cooldown returned unexpected summary");
        }

        if (
          !watchedCooldown.stderr.includes("failureCooldownApplied=true") ||
          !watchedCooldown.stderr.includes("failureCooldownSeconds=1")
        ) {
          throw new Error(
            "detect geckoterminal watch failure cooldown did not log expected stderr summary",
          );
        }

        const cooldownCheckpointRaw = await readFile(
          context.geckoterminalDetectRunnerCooldownCheckpointPath,
          "utf-8",
        );
        const cooldownCheckpointParsed = JSON.parse(cooldownCheckpointRaw) as {
          source?: string;
          cursor?: {
            poolCreatedAt?: string;
            poolAddress?: string;
          };
        };

        if (
          cooldownCheckpointParsed.source !== "geckoterminal.new_pools" ||
          cooldownCheckpointParsed.cursor?.poolCreatedAt !== "2026-04-18T04:35:54.000Z" ||
          cooldownCheckpointParsed.cursor?.poolAddress !==
            "cooldownPoolAddress1111111111111111111111111111"
        ) {
          throw new Error(
            "detect geckoterminal failure cooldown checkpoint file did not persist the expected cursor",
          );
        }
      } finally {
        if (previousGeckoApiUrl === undefined) {
          delete process.env.GECKOTERMINAL_NEW_POOLS_API_URL;
        } else {
          process.env.GECKOTERMINAL_NEW_POOLS_API_URL = previousGeckoApiUrl;
        }

        if (previousGeckoFetchError === undefined) {
          delete process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE;
        } else {
          process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE = previousGeckoFetchError;
        }

        if (previousGeckoFetchErrorCount === undefined) {
          delete process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_COUNT;
        } else {
          process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_COUNT = previousGeckoFetchErrorCount;
        }

        if (previousGeckoFailureCooldownSeconds === undefined) {
          delete process.env.LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS;
        } else {
          process.env.LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS =
            previousGeckoFailureCooldownSeconds;
        }
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

        await runCliJson<{
          mint: string;
          created: boolean;
        }>(
          "metric snapshot geckoterminal pump-only import pump",
          "src/cli/importMint.ts",
          [
            "--mint",
            context.metricSnapshotPumpMint,
            "--source",
            "geckoterminal.new_pools",
          ],
          context.smokeId,
        );

        await runCliJson<{
          mint: string;
          created: boolean;
        }>(
          "metric snapshot geckoterminal pump-only import non-pump",
          "src/cli/importMint.ts",
          [
            "--mint",
            context.metricSnapshotNonPumpMint,
            "--source",
            "geckoterminal.new_pools",
          ],
          context.smokeId,
        );

        const pumpOnlyBatch = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          selection: {
            mint: string | null;
            limit: number | null;
            sinceMinutes: number | null;
            pumpOnly: boolean;
            selectedCount: number;
            skippedNonPumpCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            skippedCount: number;
            errorCount: number;
            writtenCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
            metricCandidate?: {
              volume24h: number | null;
            };
            writeSummary: {
              metricId: number | null;
            };
          }>;
        }>(
          "metric snapshot geckoterminal pump-only batch",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--limit",
            "10",
            "--sinceMinutes",
            "5",
            "--pumpOnly",
          ],
          context.smokeId,
        );

        const pumpOnlyBatchMints = new Set(
          pumpOnlyBatch.items.map((item) => item.token.mint),
        );
        if (
          pumpOnlyBatch.mode !== "recent_batch" ||
          pumpOnlyBatch.dryRun !== true ||
          pumpOnlyBatch.writeEnabled !== false ||
          pumpOnlyBatch.selection.mint !== null ||
          pumpOnlyBatch.selection.limit !== 10 ||
          pumpOnlyBatch.selection.sinceMinutes !== 5 ||
          pumpOnlyBatch.selection.pumpOnly !== true ||
          pumpOnlyBatch.selection.selectedCount < 1 ||
          pumpOnlyBatch.selection.skippedNonPumpCount < 1 ||
          pumpOnlyBatch.summary.selectedCount !== pumpOnlyBatch.selection.selectedCount ||
          pumpOnlyBatch.summary.okCount !== pumpOnlyBatch.items.length ||
          pumpOnlyBatch.summary.skippedCount !== 0 ||
          pumpOnlyBatch.summary.errorCount !== 0 ||
          pumpOnlyBatch.summary.writtenCount !== 0 ||
          !pumpOnlyBatchMints.has(context.metricSnapshotPumpMint) ||
          pumpOnlyBatchMints.has(context.metricSnapshotNonPumpMint) ||
          pumpOnlyBatch.items.some(
            (item) =>
              item.status !== "ok" ||
              !item.token.mint.endsWith("pump") ||
              item.metricCandidate?.volume24h !== 1234 ||
              item.writeSummary.metricId !== null,
          )
        ) {
          throw new Error(
            "metric snapshot geckoterminal pump-only batch did not narrow to pump mints",
          );
        }

        const nonPumpSingle = await runCliJson<{
          mode: string;
          selection: {
            mint: string | null;
            limit: number | null;
            sinceMinutes: number | null;
            pumpOnly: boolean;
            selectedCount: number;
            skippedNonPumpCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            skippedCount: number;
            errorCount: number;
            writtenCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
            metricCandidate?: {
              volume24h: number | null;
            };
          }>;
        }>(
          "metric snapshot geckoterminal single non-pump with pump-only available",
          "src/cli/metricSnapshotGeckoterminal.ts",
          [
            "--mint",
            context.metricSnapshotNonPumpMint,
          ],
          context.smokeId,
        );

        if (
          nonPumpSingle.mode !== "single" ||
          nonPumpSingle.selection.mint !== context.metricSnapshotNonPumpMint ||
          nonPumpSingle.selection.limit !== null ||
          nonPumpSingle.selection.sinceMinutes !== null ||
          nonPumpSingle.selection.pumpOnly !== false ||
          nonPumpSingle.selection.selectedCount !== 1 ||
          nonPumpSingle.selection.skippedNonPumpCount !== 0 ||
          nonPumpSingle.summary.selectedCount !== 1 ||
          nonPumpSingle.summary.okCount !== 1 ||
          nonPumpSingle.summary.skippedCount !== 0 ||
          nonPumpSingle.summary.errorCount !== 0 ||
          nonPumpSingle.summary.writtenCount !== 0 ||
          nonPumpSingle.items.length !== 1 ||
          nonPumpSingle.items[0]?.token.mint !== context.metricSnapshotNonPumpMint ||
          nonPumpSingle.items[0]?.status !== "ok" ||
          nonPumpSingle.items[0]?.metricCandidate?.volume24h !== 1234
        ) {
          throw new Error(
            "metric snapshot geckoterminal single non-pump should remain available outside pump-only batch mode",
          );
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

    await runStep("geckoterminal enrich rescore rate limit short circuit", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
      const previousInjectedSnapshotError =
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE;

      for (const mint of context.geckoEnrichRescoreRateLimitMints) {
        await runCliJson<{
          mint: string;
          created: boolean;
        }>(
          `geckoterminal enrich rescore rate limit import ${mint}`,
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

      await writeFile(
        context.geckoEnrichRescoreFilePath,
        `${JSON.stringify(
          {
            data: {
              id: `solana_${context.geckoEnrichRescoreRateLimitMints[0]}`,
              type: "token",
              attributes: {
                address: context.geckoEnrichRescoreRateLimitMints[0],
                name: "door door",
                symbol: "DRDR",
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
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE =
          "GeckoTerminal token snapshot request failed: 429 Too Many Requests";

        const rateLimitedBatch = await runCliJsonWithStderr<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          notifyEnabled: boolean;
          selection: {
            selectedCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
            enrichWriteCount: number;
            rescoreWriteCount: number;
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
            };
            status: string;
            error?: string;
          }>;
        }>(
          "geckoterminal enrich rescore rate limit short circuit",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--limit",
            "2",
            "--sinceMinutes",
            "5",
          ],
          context.smokeId,
        );

        if (
          rateLimitedBatch.parsed.mode !== "recent_batch" ||
          rateLimitedBatch.parsed.dryRun !== true ||
          rateLimitedBatch.parsed.writeEnabled !== false ||
          rateLimitedBatch.parsed.notifyEnabled !== false ||
          rateLimitedBatch.parsed.selection.selectedCount !== 2 ||
          rateLimitedBatch.parsed.summary.selectedCount !== 2 ||
          rateLimitedBatch.parsed.summary.okCount !== 0 ||
          rateLimitedBatch.parsed.summary.errorCount !== 1 ||
          rateLimitedBatch.parsed.summary.enrichWriteCount !== 0 ||
          rateLimitedBatch.parsed.summary.rescoreWriteCount !== 0 ||
          rateLimitedBatch.parsed.summary.notifyWouldSendCount !== 0 ||
          rateLimitedBatch.parsed.summary.notifySentCount !== 0 ||
          rateLimitedBatch.parsed.summary.rateLimited !== true ||
          rateLimitedBatch.parsed.summary.rateLimitedCount !== 1 ||
          rateLimitedBatch.parsed.summary.abortedDueToRateLimit !== true ||
          rateLimitedBatch.parsed.summary.skippedAfterRateLimit !== 1 ||
          rateLimitedBatch.parsed.items.length !== 1 ||
          rateLimitedBatch.parsed.items[0]?.status !== "error" ||
          !rateLimitedBatch.parsed.items[0]?.error?.includes("429 Too Many Requests")
        ) {
          throw new Error(
            "geckoterminal enrich rescore rate limit short circuit returned unexpected summary",
          );
        }

        if (
          !rateLimitedBatch.stderr.includes("rateLimited=true") ||
          !rateLimitedBatch.stderr.includes("skippedAfterRateLimit=1")
        ) {
          throw new Error(
            "geckoterminal enrich rescore rate limit short circuit did not log expected stderr summary",
          );
        }

        delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE;

        const continuedBatch = await runCliJsonWithStderr<{
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
            enrichWriteCount: number;
            rescoreWriteCount: number;
            rateLimited: boolean;
            rateLimitedCount: number;
            abortedDueToRateLimit: boolean;
            skippedAfterRateLimit: number;
          };
          items: Array<{
            status: string;
            fetchedSnapshot?: {
              symbol: string | null;
            };
          }>;
        }>(
          "geckoterminal enrich rescore after rate limit",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--limit",
            "2",
            "--sinceMinutes",
            "5",
          ],
          context.smokeId,
        );

        if (
          continuedBatch.parsed.summary.selectedCount !== 2 ||
          continuedBatch.parsed.summary.okCount !== 2 ||
          continuedBatch.parsed.summary.errorCount !== 0 ||
          continuedBatch.parsed.summary.enrichWriteCount !== 0 ||
          continuedBatch.parsed.summary.rescoreWriteCount !== 0 ||
          continuedBatch.parsed.summary.rateLimited !== false ||
          continuedBatch.parsed.summary.rateLimitedCount !== 0 ||
          continuedBatch.parsed.summary.abortedDueToRateLimit !== false ||
          continuedBatch.parsed.summary.skippedAfterRateLimit !== 0 ||
          continuedBatch.parsed.items.length !== 2 ||
          continuedBatch.parsed.items[0]?.status !== "ok" ||
          continuedBatch.parsed.items[1]?.status !== "ok" ||
          continuedBatch.parsed.items[0]?.fetchedSnapshot?.symbol !== "DRDR" ||
          continuedBatch.parsed.items[1]?.fetchedSnapshot?.symbol !== "DRDR"
        ) {
          throw new Error(
            "geckoterminal enrich rescore after rate limit returned unexpected summary",
          );
        }

        if (
          !continuedBatch.stderr.includes("rateLimited=false") ||
          !continuedBatch.stderr.includes("skippedAfterRateLimit=0")
        ) {
          throw new Error(
            "geckoterminal enrich rescore after rate limit did not log expected stderr summary",
          );
        }

        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE =
          "GeckoTerminal token snapshot request failed: 429 Too Many Requests";
        process.env.LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS = "0";
        process.env.LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS = "60";
        process.env.LOWCAP_GECKOTERMINAL_ENRICH_FAILURE_COOLDOWN_SECONDS = "1";
        process.env.LOWCAP_GECKOTERMINAL_ENRICH_LIMIT = "2";
        process.env.LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES = "5";
        process.env.LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON = "1";

        const runnerStdoutPath = `/tmp/${context.smokeId}-gecko-enrich-runner.stdout.json`;
        const runnerStderrPath = `/tmp/${context.smokeId}-gecko-enrich-runner.stderr.log`;

        try {
          await execFileAsync("bash", [
            "-lc",
            [
              "timeout 4 bash ./scripts/run-geckoterminal-enrich-rescore-notify.sh",
              `> ${shellEscape(runnerStdoutPath)}`,
              `2> ${shellEscape(runnerStderrPath)}`,
            ].join(" "),
          ], {
            cwd: process.cwd(),
            env: process.env,
          });
        } catch (error) {
          const output = error as { code?: number; signal?: string };
          if (output.code !== 124 && output.signal !== "SIGTERM") {
            throw error;
          }
        }

        const [runnerStdout, runnerStderr] = await Promise.all([
          readFile(runnerStdoutPath, "utf-8"),
          readFile(runnerStderrPath, "utf-8"),
        ]);

        const runnerParsed = parseJson<{
          summary: {
            rateLimited: boolean;
            rateLimitedCount: number;
          };
        }>(
          "geckoterminal enrich runner rate limit cooldown",
          runnerStdout.trim(),
        );

        if (
          runnerParsed.summary.rateLimited !== true ||
          runnerParsed.summary.rateLimitedCount !== 1 ||
          !runnerStderr.includes("rate_limited=true") ||
          !runnerStderr.includes("failure_cooldown_seconds=1") ||
          runnerStderr.includes("cycle_parse_failed")
        ) {
          throw new Error(
            "geckoterminal enrich runner rate limit cooldown did not parse JSON or log cooldown as expected",
          );
        }

        await rm(runnerStdoutPath, { force: true });
        await rm(runnerStderrPath, { force: true });

        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_FAILURE_COOLDOWN_SECONDS;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_LIMIT;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON;
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }

        if (previousInjectedSnapshotError === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE = previousInjectedSnapshotError;
        }

        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_FAILURE_COOLDOWN_SECONDS;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_LIMIT;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES;
        delete process.env.LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON;
        await rm(`/tmp/${context.smokeId}-gecko-enrich-runner.stdout.json`, { force: true });
        await rm(`/tmp/${context.smokeId}-gecko-enrich-runner.stderr.log`, { force: true });
      }
    });

    await runStep("geckoterminal runner db preflight", async () => {
      const invalidDbPath = `/tmp/${context.smokeId}-gecko-runner-preflight.db`;
      const helperStdoutPath = `/tmp/${context.smokeId}-gecko-runner-preflight-helper.stdout.log`;
      const helperStderrPath = `/tmp/${context.smokeId}-gecko-runner-preflight-helper.stderr.log`;
      const runnerStdoutPath = `/tmp/${context.smokeId}-gecko-runner-preflight-runner.stdout.log`;
      const runnerStderrPath = `/tmp/${context.smokeId}-gecko-runner-preflight-runner.stderr.log`;

      await rm(invalidDbPath, { force: true });
      await rm(helperStdoutPath, { force: true });
      await rm(helperStderrPath, { force: true });
      await rm(runnerStdoutPath, { force: true });
      await rm(runnerStderrPath, { force: true });

      let helperFailed = false;

      try {
        await execFileAsync("bash", [
          "-lc",
          [
            "node ./scripts/check-prisma-token-table.mjs geckoterminal-enrich-rescore-notify 200",
            `> ${shellEscape(helperStdoutPath)}`,
            `2> ${shellEscape(helperStderrPath)}`,
          ].join(" "),
        ], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: `file:${invalidDbPath}`,
          },
        });
      } catch (error) {
        helperFailed = true;
        const stderr = await readFile(helperStderrPath, "utf-8");

        if (
          !stderr.includes("db_preflight_failed") ||
          !stderr.includes("main.Token")
        ) {
          throw new Error(
            "geckoterminal runner db preflight helper did not return the expected failure message",
          );
        }
      }

      if (!helperFailed) {
        throw new Error("geckoterminal runner db preflight helper unexpectedly succeeded");
      }

      let runnerFailed = false;

      try {
        await execFileAsync("bash", [
          "-lc",
          [
            "timeout 7 bash ./scripts/run-geckoterminal-enrich-rescore-notify.sh",
            `> ${shellEscape(runnerStdoutPath)}`,
            `2> ${shellEscape(runnerStderrPath)}`,
          ].join(" "),
        ], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: `file:${invalidDbPath}`,
            LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS: "0",
          },
        });
      } catch (error) {
        runnerFailed = true;
        const stderr = await readFile(runnerStderrPath, "utf-8");

        if (
          !stderr.includes("db_preflight_failed") ||
          stderr.includes("cycle_start=") ||
          stderr.includes("cycle_failed=")
        ) {
          throw new Error(
            "geckoterminal enrich runner did not fail fast on db preflight",
          );
        }
      }

      if (!runnerFailed) {
        throw new Error("geckoterminal enrich runner unexpectedly started without Token table");
      }

      await rm(invalidDbPath, { force: true });
      await rm(helperStdoutPath, { force: true });
      await rm(helperStderrPath, { force: true });
      await rm(runnerStdoutPath, { force: true });
      await rm(runnerStderrPath, { force: true });
    });

    await runStep("geckoterminal enrich rescore batch", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
      const previousTelegramCaptureFile = process.env.LOWCAP_TELEGRAM_CAPTURE_FILE;

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

      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "geckoterminal enrich rescore complete import",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.geckoEnrichRescoreCompleteMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      await runCliJson<{
        mint: string;
        metadataStatus: string;
        changed: {
          name: boolean;
          symbol: boolean;
        };
      }>(
        "geckoterminal enrich rescore complete enrich",
        "src/cli/tokenEnrich.ts",
        [
          "--mint",
          context.geckoEnrichRescoreCompleteMint,
          "--name",
          "already complete",
          "--symbol",
          "ALRDY",
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
                name: "pokemon dog newinfo",
                symbol: "SMGET",
                description: "gecko enrich context description",
                websites: ["https://example.com/gecko-enrich"],
                twitter_username: "gecko_enrich_token",
                telegram_handle: "geckoenrich",
                discord_url: "https://discord.gg/geckoenrich",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      await writeFile(context.telegramCaptureFilePath, "", "utf-8");

      try {
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.geckoEnrichRescoreFilePath;
        process.env.LOWCAP_TELEGRAM_CAPTURE_FILE = context.telegramCaptureFilePath;

        const dryRun = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          notifyEnabled: boolean;
          selection: {
            selectedCount: number;
            selectedIncompleteCount: number;
            skippedCompleteCount: number;
          };
          summary: {
            selectedCount: number;
            selectedIncompleteCount: number;
            skippedCompleteCount: number;
            okCount: number;
            errorCount: number;
            enrichWriteCount: number;
            rescoreWriteCount: number;
            notifyCandidateCount: number;
            notifyWouldSendCount: number;
            notifySentCount: number;
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
            contextAvailable: boolean;
            contextWouldWrite: boolean;
            savedContextFields: string[];
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
            notifyEligibleBefore: boolean;
            notifyEligibleAfter: boolean;
            notifyWouldSend: boolean;
            notifySent: boolean;
            writeSummary: {
              dryRun: boolean;
              enrichUpdated: boolean;
              rescoreUpdated: boolean;
              contextUpdated: boolean;
            };
          }>;
        }>(
          "geckoterminal enrich rescore dry-run",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--limit",
            "2",
            "--sinceMinutes",
            "5",
          ],
          context.smokeId,
        );

        const selectedMints = dryRun.items.map((item) => item.token.mint);
        const selectedTargetItem = dryRun.items.find(
          (item) => item.token.mint === context.geckoEnrichRescoreMint,
        );

        if (
          dryRun.mode !== "recent_batch" ||
          dryRun.dryRun !== true ||
          dryRun.writeEnabled !== false ||
          dryRun.notifyEnabled !== false ||
          dryRun.selection.selectedCount !== 2 ||
          dryRun.selection.selectedIncompleteCount !== 2 ||
          dryRun.selection.skippedCompleteCount !== 1 ||
          dryRun.summary.selectedCount !== 2 ||
          dryRun.summary.selectedIncompleteCount !== 2 ||
          dryRun.summary.skippedCompleteCount !== 1 ||
          dryRun.summary.okCount !== 2 ||
          dryRun.summary.errorCount !== 0 ||
          dryRun.summary.enrichWriteCount !== 0 ||
          dryRun.summary.rescoreWriteCount !== 0 ||
          dryRun.summary.notifyWouldSendCount !== 2 ||
          dryRun.summary.notifySentCount !== 0 ||
          dryRun.items.length !== 2 ||
          selectedMints.includes(context.geckoEnrichRescoreCompleteMint) ||
          !selectedTargetItem ||
          selectedTargetItem.token.metadataStatus !== "mint_only" ||
          selectedTargetItem.selectedReason !== "Token.createdAt" ||
          selectedTargetItem.status !== "ok" ||
          selectedTargetItem.fetchedSnapshot?.name !== "pokemon dog newinfo" ||
          selectedTargetItem.fetchedSnapshot?.symbol !== "SMGET" ||
          selectedTargetItem.contextAvailable !== true ||
          selectedTargetItem.contextWouldWrite !== true ||
          selectedTargetItem.savedContextFields.length !== 0 ||
          selectedTargetItem.enrichPlan?.hasPatch !== true ||
          selectedTargetItem.enrichPlan?.willUpdate !== true ||
          selectedTargetItem.enrichPlan?.preview.metadataStatus !== "partial" ||
          selectedTargetItem.rescorePreview?.ready !== true ||
          selectedTargetItem.rescorePreview?.scoreRank !== "S" ||
          typeof selectedTargetItem.rescorePreview?.hardRejected !== "boolean" ||
          selectedTargetItem.notifyCandidate !== true ||
          selectedTargetItem.notifyEligibleBefore !== false ||
          selectedTargetItem.notifyEligibleAfter !== true ||
          selectedTargetItem.notifyWouldSend !== true ||
          selectedTargetItem.notifySent !== false ||
          selectedTargetItem.writeSummary.dryRun !== true ||
          selectedTargetItem.writeSummary.enrichUpdated !== false ||
          selectedTargetItem.writeSummary.rescoreUpdated !== false ||
          selectedTargetItem.writeSummary.contextUpdated !== false
        ) {
          throw new Error("geckoterminal enrich rescore dry-run returned unexpected summary");
        }

        const completeSingleDryRun = await runCliJson<{
          mode: string;
          selection: {
            mint: string | null;
            selectedCount: number;
            selectedIncompleteCount: number;
            skippedCompleteCount: number;
          };
          summary: {
            selectedCount: number;
            selectedIncompleteCount: number;
            skippedCompleteCount: number;
            okCount: number;
            errorCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
          }>;
        }>(
          "geckoterminal enrich rescore single complete dry-run",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--mint",
            context.geckoEnrichRescoreCompleteMint,
          ],
          context.smokeId,
        );

        if (
          completeSingleDryRun.mode !== "single" ||
          completeSingleDryRun.selection.mint !== context.geckoEnrichRescoreCompleteMint ||
          completeSingleDryRun.selection.selectedCount !== 1 ||
          completeSingleDryRun.selection.selectedIncompleteCount !== 0 ||
          completeSingleDryRun.selection.skippedCompleteCount !== 0 ||
          completeSingleDryRun.summary.selectedCount !== 1 ||
          completeSingleDryRun.summary.selectedIncompleteCount !== 0 ||
          completeSingleDryRun.summary.skippedCompleteCount !== 0 ||
          completeSingleDryRun.summary.okCount !== 1 ||
          completeSingleDryRun.summary.errorCount !== 0 ||
          completeSingleDryRun.items.length !== 1 ||
          completeSingleDryRun.items[0]?.token.mint !== context.geckoEnrichRescoreCompleteMint ||
          completeSingleDryRun.items[0]?.status !== "ok"
        ) {
          throw new Error(
            "geckoterminal enrich rescore single complete dry-run returned unexpected summary",
          );
        }

        const beforeWrite = await db.token.findUnique({
          where: { mint: context.geckoEnrichRescoreMint },
          select: {
            name: true,
            symbol: true,
            metadataStatus: true,
            enrichedAt: true,
            rescoredAt: true,
            entrySnapshot: true,
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

        const beforeWriteEntrySnapshot =
          beforeWrite.entrySnapshot &&
          typeof beforeWrite.entrySnapshot === "object" &&
          !Array.isArray(beforeWrite.entrySnapshot)
            ? (beforeWrite.entrySnapshot as Record<string, unknown>)
            : null;

        if (
          beforeWriteEntrySnapshot?.contextCapture &&
          typeof beforeWriteEntrySnapshot.contextCapture === "object"
        ) {
          throw new Error("geckoterminal enrich rescore dry-run unexpectedly wrote context");
        }

        const written = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          notifyEnabled: boolean;
          summary: {
            okCount: number;
            errorCount: number;
            enrichWriteCount: number;
            rescoreWriteCount: number;
            contextAvailableCount: number;
            contextWriteCount: number;
            notifyWouldSendCount: number;
            notifySentCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
            contextAvailable: boolean;
            contextWouldWrite: boolean;
            savedContextFields: string[];
            enrichPlan?: {
              willUpdate: boolean;
            };
            rescorePreview?: {
              ready: boolean;
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
            };
          }>;
        }>(
          "geckoterminal enrich rescore write",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--mint",
            context.geckoEnrichRescoreMint,
            "--write",
            "--notify",
          ],
          context.smokeId,
        );

        if (
          written.mode !== "single" ||
          written.dryRun !== false ||
          written.writeEnabled !== true ||
          written.notifyEnabled !== true ||
          written.summary.okCount !== 1 ||
          written.summary.errorCount !== 0 ||
          written.summary.enrichWriteCount !== 1 ||
          written.summary.rescoreWriteCount !== 1 ||
          written.summary.contextAvailableCount !== 1 ||
          written.summary.contextWriteCount !== 1 ||
          written.summary.notifyWouldSendCount !== 1 ||
          written.summary.notifySentCount !== 1 ||
          written.items.length !== 1 ||
          written.items[0]?.token.mint !== context.geckoEnrichRescoreMint ||
          written.items[0]?.status !== "ok" ||
          written.items[0]?.contextAvailable !== true ||
          written.items[0]?.contextWouldWrite !== true ||
          written.items[0]?.savedContextFields.length !== 0 ||
          written.items[0]?.enrichPlan?.willUpdate !== true ||
          written.items[0]?.rescorePreview?.ready !== true ||
          written.items[0]?.rescorePreview?.scoreRank !== "S" ||
          typeof written.items[0]?.rescorePreview?.hardRejected !== "boolean" ||
          written.items[0]?.notifyCandidate !== true ||
          written.items[0]?.notifyEligibleBefore !== false ||
          written.items[0]?.notifyEligibleAfter !== true ||
          written.items[0]?.notifyWouldSend !== true ||
          written.items[0]?.notifySent !== true ||
          written.items[0]?.writeSummary.dryRun !== false ||
          written.items[0]?.writeSummary.enrichUpdated !== true ||
          written.items[0]?.writeSummary.rescoreUpdated !== true ||
          written.items[0]?.writeSummary.contextUpdated !== true
        ) {
          throw new Error("geckoterminal enrich rescore write returned unexpected summary");
        }

        const firstNotifyCapture = (await readFile(context.telegramCaptureFilePath, "utf-8"))
          .trim()
          .split("\n")
          .filter((line) => line.length > 0);

        if (
          firstNotifyCapture.length !== 1 ||
          !firstNotifyCapture[0]?.includes("S-rank token enriched and rescored") ||
          !firstNotifyCapture[0]?.includes(context.geckoEnrichRescoreMint)
        ) {
          throw new Error("geckoterminal enrich rescore notify did not capture exactly one message");
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
            entrySnapshot: true,
          },
        });

        const updatedEntrySnapshot =
          updatedToken?.entrySnapshot &&
          typeof updatedToken.entrySnapshot === "object" &&
          !Array.isArray(updatedToken.entrySnapshot)
            ? (updatedToken.entrySnapshot as Record<string, unknown>)
            : null;
        const updatedContextCapture =
          updatedEntrySnapshot?.contextCapture &&
          typeof updatedEntrySnapshot.contextCapture === "object" &&
          !Array.isArray(updatedEntrySnapshot.contextCapture)
            ? (updatedEntrySnapshot.contextCapture as Record<string, unknown>)
            : null;
        const updatedSavedSnapshot =
          updatedContextCapture?.geckoterminalTokenSnapshot &&
          typeof updatedContextCapture.geckoterminalTokenSnapshot === "object" &&
          !Array.isArray(updatedContextCapture.geckoterminalTokenSnapshot)
            ? (updatedContextCapture.geckoterminalTokenSnapshot as Record<string, unknown>)
            : null;
        const updatedSavedMetadataText =
          updatedSavedSnapshot?.metadataText &&
          typeof updatedSavedSnapshot.metadataText === "object" &&
          !Array.isArray(updatedSavedSnapshot.metadataText)
            ? (updatedSavedSnapshot.metadataText as Record<string, unknown>)
            : null;
        const updatedSavedLinks =
          updatedSavedSnapshot?.links &&
          typeof updatedSavedSnapshot.links === "object" &&
          !Array.isArray(updatedSavedSnapshot.links)
            ? (updatedSavedSnapshot.links as Record<string, unknown>)
            : null;

        if (
          !updatedToken ||
          updatedToken.source !== "geckoterminal.new_pools" ||
          updatedToken.name !== "pokemon dog newinfo" ||
          updatedToken.symbol !== "SMGET" ||
          updatedToken.description !== null ||
          updatedToken.metadataStatus !== "partial" ||
          !updatedToken.enrichedAt ||
          !updatedToken.rescoredAt ||
          typeof updatedToken.normalizedText !== "string" ||
          typeof updatedToken.scoreTotal !== "number" ||
          updatedToken.scoreRank !== "S" ||
          typeof updatedToken.hardRejected !== "boolean" ||
          !updatedSavedSnapshot ||
          updatedSavedSnapshot.source !== "geckoterminal.token_snapshot" ||
          updatedSavedMetadataText?.description !== "gecko enrich context description" ||
          updatedSavedLinks?.website !== "https://example.com/gecko-enrich" ||
          updatedSavedLinks?.x !== "https://x.com/gecko_enrich_token" ||
          updatedSavedLinks?.telegram !== "https://t.me/geckoenrich" ||
          !Array.isArray(updatedSavedLinks?.otherLinks) ||
          !(updatedSavedLinks.otherLinks as unknown[]).includes("https://discord.gg/geckoenrich")
        ) {
          throw new Error("geckoterminal enrich rescore write did not persist expected token fields");
        }

        const rerun = await runCliJson<{
          summary: {
            notifyWouldSendCount: number;
            notifySentCount: number;
          };
          items: Array<{
            status: string;
            contextAvailable: boolean;
            contextWouldWrite: boolean;
            savedContextFields: string[];
            notifyEligibleBefore: boolean;
            notifyEligibleAfter: boolean;
            notifyWouldSend: boolean;
            notifySent: boolean;
            writeSummary: {
              enrichUpdated: boolean;
              rescoreUpdated: boolean;
              contextUpdated: boolean;
            };
          }>;
        }>(
          "geckoterminal enrich rescore rerun notify",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--mint",
            context.geckoEnrichRescoreMint,
            "--write",
            "--notify",
          ],
          context.smokeId,
        );

        if (
          rerun.summary.notifyWouldSendCount !== 0 ||
          rerun.summary.notifySentCount !== 0 ||
          rerun.items.length !== 1 ||
          rerun.items[0]?.status !== "ok" ||
          rerun.items[0]?.contextAvailable !== true ||
          rerun.items[0]?.contextWouldWrite !== false ||
          rerun.items[0]?.savedContextFields.length < 4 ||
          rerun.items[0]?.notifyEligibleBefore !== true ||
          rerun.items[0]?.notifyEligibleAfter !== true ||
          rerun.items[0]?.notifyWouldSend !== false ||
          rerun.items[0]?.notifySent !== false ||
          rerun.items[0]?.writeSummary.enrichUpdated !== false ||
          rerun.items[0]?.writeSummary.rescoreUpdated !== true ||
          rerun.items[0]?.writeSummary.contextUpdated !== false
        ) {
          throw new Error("geckoterminal enrich rescore rerun notify unexpectedly duplicated a send");
        }

        const finalNotifyCapture = (await readFile(context.telegramCaptureFilePath, "utf-8"))
          .trim()
          .split("\n")
          .filter((line) => line.length > 0);

        if (finalNotifyCapture.length !== 1) {
          throw new Error("geckoterminal enrich rescore rerun notify changed capture count");
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }

        if (previousTelegramCaptureFile === undefined) {
          delete process.env.LOWCAP_TELEGRAM_CAPTURE_FILE;
        } else {
          process.env.LOWCAP_TELEGRAM_CAPTURE_FILE = previousTelegramCaptureFile;
        }
      }
    });

    await runStep("geckoterminal enrich rescore pump-only batch", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;

      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "geckoterminal enrich rescore pump-only import pump",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.geckoEnrichRescorePumpMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "geckoterminal enrich rescore pump-only import non-pump",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.geckoEnrichRescoreNonPumpMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      try {
        await writeFile(
          context.geckoEnrichRescoreFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.geckoEnrichRescorePumpMint}`,
                type: "token",
                attributes: {
                  address: context.geckoEnrichRescorePumpMint,
                  name: "pump fast follow",
                  symbol: "PFAST",
                },
              },
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.geckoEnrichRescoreFilePath;

        const pumpOnlyBatch = await runCliJson<{
          mode: string;
          selection: {
            mint: string | null;
            pumpOnly: boolean;
            selectedCount: number;
            selectedIncompleteCount: number;
            skippedNonPumpCount: number;
          };
          summary: {
            selectedCount: number;
            selectedIncompleteCount: number;
            skippedNonPumpCount: number;
            okCount: number;
            errorCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
          }>;
        }>(
          "geckoterminal enrich rescore pump-only batch",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--limit",
            "5",
            "--sinceMinutes",
            "5",
            "--pumpOnly",
          ],
          context.smokeId,
        );

        const pumpOnlyBatchMints = new Set(
          pumpOnlyBatch.items.map((item) => item.token.mint),
        );

        if (
          pumpOnlyBatch.mode !== "recent_batch" ||
          pumpOnlyBatch.selection.mint !== null ||
          pumpOnlyBatch.selection.pumpOnly !== true ||
          pumpOnlyBatch.selection.selectedCount < 1 ||
          pumpOnlyBatch.selection.selectedIncompleteCount !==
            pumpOnlyBatch.selection.selectedCount ||
          pumpOnlyBatch.selection.skippedNonPumpCount < 1 ||
          pumpOnlyBatch.summary.selectedCount !== pumpOnlyBatch.selection.selectedCount ||
          pumpOnlyBatch.summary.selectedIncompleteCount !==
            pumpOnlyBatch.selection.selectedIncompleteCount ||
          pumpOnlyBatch.summary.skippedNonPumpCount < 1 ||
          pumpOnlyBatch.summary.okCount !== pumpOnlyBatch.items.length ||
          pumpOnlyBatch.summary.errorCount !== 0 ||
          !pumpOnlyBatchMints.has(context.geckoEnrichRescorePumpMint) ||
          pumpOnlyBatchMints.has(context.geckoEnrichRescoreNonPumpMint) ||
          pumpOnlyBatch.items.some(
            (item) => item.status !== "ok" || !item.token.mint.endsWith("pump"),
          )
        ) {
          throw new Error(
            "geckoterminal enrich rescore pump-only batch did not narrow to pump mints",
          );
        }

        await writeFile(
          context.geckoEnrichRescoreFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.geckoEnrichRescoreNonPumpMint}`,
                type: "token",
                attributes: {
                  address: context.geckoEnrichRescoreNonPumpMint,
                  name: "non pump single",
                  symbol: "NPS",
                },
              },
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );

        const nonPumpSingle = await runCliJson<{
          mode: string;
          selection: {
            mint: string | null;
            pumpOnly: boolean;
            selectedCount: number;
            selectedIncompleteCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
          }>;
        }>(
          "geckoterminal enrich rescore single non-pump with pump-only available",
          "src/cli/tokenEnrichRescoreGeckoterminal.ts",
          [
            "--mint",
            context.geckoEnrichRescoreNonPumpMint,
          ],
          context.smokeId,
        );

        if (
          nonPumpSingle.mode !== "single" ||
          nonPumpSingle.selection.mint !== context.geckoEnrichRescoreNonPumpMint ||
          nonPumpSingle.selection.pumpOnly !== false ||
          nonPumpSingle.selection.selectedCount !== 1 ||
          nonPumpSingle.selection.selectedIncompleteCount !== 1 ||
          nonPumpSingle.summary.selectedCount !== 1 ||
          nonPumpSingle.summary.okCount !== 1 ||
          nonPumpSingle.summary.errorCount !== 0 ||
          nonPumpSingle.items.length !== 1 ||
          nonPumpSingle.items[0]?.token.mint !== context.geckoEnrichRescoreNonPumpMint ||
          nonPumpSingle.items[0]?.status !== "ok"
        ) {
          throw new Error(
            "geckoterminal enrich rescore single non-pump should remain available outside pump-only batch mode",
          );
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }
      }
    });

    await runStep("geckoterminal ops summary", async () => {
      const [tokenCountBefore, metricCountBefore] = await Promise.all([
        db.token.count(),
        db.metric.count(),
      ]);

      const parsed = await runCliJson<{
        readOnly: boolean;
        originSource: string;
        selection: {
          sinceHours: number;
          previewLimit: number;
          pumpOnly: boolean;
          geckoOriginTokenCount: number;
          skippedNonPumpCount: number;
        };
        summary: {
          geckoOriginTokenCount: number;
          firstSeenSourceSnapshotCount: number;
          nameSymbolFilledCount: number;
          enrichedTokenCount: number;
          rescoredTokenCount: number;
          metricTokenCount: number;
          metricCount: number;
          hardRejectedCount: number;
          notifyCandidateCount: number;
        };
        scoreRankCounts: Record<string, number>;
        metadataStatusCounts: Record<string, number>;
        currentSourceCounts: Array<{
          value: string | null;
          count: number;
        }>;
        originSourceCounts: Array<{
          value: string | null;
          count: number;
        }>;
        preview: Array<{
          mint: string;
          originSource: string | null;
          currentSource: string | null;
          metadataStatus: string;
          metricsCount: number;
          latestMetricObservedAt: string | null;
          latestMetricSource: string | null;
          notifyCandidate: boolean;
        }>;
      }>(
        "geckoterminal ops summary",
        "src/cli/geckoterminalOpsSummary.ts",
        [
          "--sinceHours",
          "24",
          "--limit",
          "50",
        ],
        context.smokeId,
      );

      const [tokenCountAfter, metricCountAfter] = await Promise.all([
        db.token.count(),
        db.metric.count(),
      ]);

      if (
        tokenCountBefore !== tokenCountAfter ||
        metricCountBefore !== metricCountAfter
      ) {
        throw new Error("geckoterminal ops summary was not read-only");
      }

      if (
        parsed.readOnly !== true ||
        parsed.originSource !== "geckoterminal.new_pools" ||
        parsed.selection.sinceHours !== 24 ||
        parsed.selection.previewLimit !== 50 ||
        parsed.selection.pumpOnly !== false ||
        parsed.selection.geckoOriginTokenCount < 4 ||
        parsed.summary.geckoOriginTokenCount !== parsed.selection.geckoOriginTokenCount ||
        parsed.summary.firstSeenSourceSnapshotCount < 1 ||
        parsed.summary.nameSymbolFilledCount < 1 ||
        parsed.summary.enrichedTokenCount < 1 ||
        parsed.summary.rescoredTokenCount < 1 ||
        parsed.summary.metricTokenCount < 1 ||
        parsed.summary.metricCount < 1 ||
        !Array.isArray(parsed.currentSourceCounts) ||
        parsed.currentSourceCounts.length === 0 ||
        !Array.isArray(parsed.originSourceCounts) ||
        parsed.originSourceCounts.length === 0 ||
        !Array.isArray(parsed.preview) ||
        parsed.preview.length === 0
      ) {
        throw new Error("geckoterminal ops summary returned unexpected top-level summary");
      }

      if (
        parsed.originSourceCounts[0]?.value !== "geckoterminal.new_pools" ||
        (parsed.scoreRankCounts.C ?? 0) < 1 ||
        (parsed.metadataStatusCounts.mint_only ?? 0) < 1
      ) {
        throw new Error("geckoterminal ops summary returned unexpected count breakdowns");
      }

      const geckoPreviewMints = new Set(parsed.preview.map((item) => item.mint));
      if (
        !geckoPreviewMints.has(context.geckoEnrichRescoreMint) ||
        !geckoPreviewMints.has(context.metricSnapshotMint)
      ) {
        throw new Error("geckoterminal ops summary preview did not include expected Gecko tokens");
      }

      if (
        parsed.preview.some(
          (item) =>
            item.originSource !== "geckoterminal.new_pools" ||
            typeof item.metadataStatus !== "string" ||
            typeof item.metricsCount !== "number" ||
            typeof item.notifyCandidate !== "boolean",
        )
      ) {
        throw new Error("geckoterminal ops summary preview returned unexpected item fields");
      }

      const pumpOnlyParsed = await runCliJson<{
        readOnly: boolean;
        selection: {
          sinceHours: number;
          previewLimit: number;
          pumpOnly: boolean;
          geckoOriginTokenCount: number;
          skippedNonPumpCount: number;
        };
        summary: {
          geckoOriginTokenCount: number;
        };
        preview: Array<{
          mint: string;
        }>;
      }>(
        "geckoterminal ops summary pump-only",
        "src/cli/geckoterminalOpsSummary.ts",
        [
          "--sinceHours",
          "24",
          "--limit",
          "50",
          "--pumpOnly",
        ],
        context.smokeId,
      );

      const [tokenCountAfterPumpOnly, metricCountAfterPumpOnly] = await Promise.all([
        db.token.count(),
        db.metric.count(),
      ]);

      const pumpOnlyPreviewMints = new Set(pumpOnlyParsed.preview.map((item) => item.mint));
      if (
        tokenCountBefore !== tokenCountAfterPumpOnly ||
        metricCountBefore !== metricCountAfterPumpOnly
      ) {
        throw new Error("geckoterminal ops summary pump-only was not read-only");
      }

      if (
        pumpOnlyParsed.readOnly !== true ||
        pumpOnlyParsed.selection.sinceHours !== 24 ||
        pumpOnlyParsed.selection.previewLimit !== 50 ||
        pumpOnlyParsed.selection.pumpOnly !== true ||
        pumpOnlyParsed.selection.geckoOriginTokenCount < 1 ||
        pumpOnlyParsed.selection.skippedNonPumpCount < 1 ||
        pumpOnlyParsed.summary.geckoOriginTokenCount !==
          pumpOnlyParsed.selection.geckoOriginTokenCount ||
        !pumpOnlyPreviewMints.has(context.geckoEnrichRescorePumpMint) ||
        pumpOnlyPreviewMints.has(context.geckoEnrichRescoreNonPumpMint) ||
        pumpOnlyParsed.preview.some((item) => !item.mint.endsWith("pump"))
      ) {
        throw new Error("geckoterminal ops summary pump-only did not narrow the cohort");
      }

      const packageStdoutPath = `/tmp/${context.smokeId}-gecko-ops-summary-package.stdout.json`;
      const packageStderrPath = `/tmp/${context.smokeId}-gecko-ops-summary-package.stderr.log`;

      await rm(packageStdoutPath, { force: true });
      await rm(packageStderrPath, { force: true });

      await execFileAsync("bash", [
        "-lc",
        [
          "pnpm ops:summary:geckoterminal -- --sinceHours 24 --limit 5",
          `> ${shellEscape(packageStdoutPath)}`,
          `2> ${shellEscape(packageStderrPath)}`,
        ].join(" "),
      ], {
        cwd: process.cwd(),
        env: process.env,
      });

      const packageRaw = (await readFile(packageStdoutPath, "utf-8")).trim();
      const jsonStartIndex = packageRaw.indexOf("{");
      if (jsonStartIndex < 0) {
        throw new Error("geckoterminal ops summary package script did not emit JSON");
      }

      const packageParsed = parseJson<{
        readOnly: boolean;
        selection: {
          sinceHours: number;
          previewLimit: number;
          pumpOnly: boolean;
        };
        summary: {
          geckoOriginTokenCount: number;
        };
      }>(
        "geckoterminal ops summary package script",
        packageRaw.slice(jsonStartIndex),
      );

      if (
        packageParsed.readOnly !== true ||
        packageParsed.selection.sinceHours !== 24 ||
        packageParsed.selection.previewLimit !== 5 ||
        packageParsed.selection.pumpOnly !== false ||
        packageParsed.summary.geckoOriginTokenCount < 1
      ) {
        throw new Error("geckoterminal ops summary package script returned unexpected output");
      }

      await rm(packageStdoutPath, { force: true });
      await rm(packageStderrPath, { force: true });
    });

    await runStep("geckoterminal review queue", async () => {
      const [tokenCountBefore, metricCountBefore] = await Promise.all([
        db.token.count(),
        db.metric.count(),
      ]);

      const parsed = await runCliJson<{
        readOnly: boolean;
        originSource: string;
        selection: {
          sinceHours: number;
          limit: number;
          pumpOnly: boolean;
          staleAfterHours: number;
          geckoOriginTokenCount: number;
          skippedNonPumpCount: number;
        };
        summary: {
          geckoOriginTokenCount: number;
          firstSeenSourceSnapshotCount: number;
          enrichPendingCount: number;
          rescorePendingCount: number;
          metricPendingCount: number;
          notifyCandidateCount: number;
          staleReviewCount: number;
          highPriorityRecentCount: number;
        };
        queues: {
          notifyCandidate: Array<{
            mint: string;
            queuesMatched: string[];
            reviewReasons: string[];
          }>;
          highPriorityRecent: Array<{
            mint: string;
            queuesMatched: string[];
            reviewReasons: string[];
          }>;
          staleReview: Array<{
            mint: string;
            ageHours: number;
            queuesMatched: string[];
          }>;
          rescorePending: Array<{
            mint: string;
            queuesMatched: string[];
            reviewReasons: string[];
          }>;
          enrichPending: Array<{
            mint: string;
            metadataStatus: string;
            queuesMatched: string[];
          }>;
          metricPending: Array<{
            mint: string;
            metricsCount: number;
            queuesMatched: string[];
          }>;
        };
        preview: Array<{
          mint: string;
          queuesMatched: string[];
          reviewReasons: string[];
          metricsCount: number;
        }>;
      }>(
        "geckoterminal review queue",
        "src/cli/geckoterminalReviewQueue.ts",
        [
          "--sinceHours",
          "24",
          "--limit",
          "50",
        ],
        context.smokeId,
      );

      const [tokenCountAfter, metricCountAfter] = await Promise.all([
        db.token.count(),
        db.metric.count(),
      ]);

      if (
        tokenCountBefore !== tokenCountAfter ||
        metricCountBefore !== metricCountAfter
      ) {
        throw new Error("geckoterminal review queue was not read-only");
      }

      if (
        parsed.readOnly !== true ||
        parsed.originSource !== "geckoterminal.new_pools" ||
        parsed.selection.sinceHours !== 24 ||
        parsed.selection.limit !== 50 ||
        parsed.selection.pumpOnly !== false ||
        parsed.selection.staleAfterHours !== 6 ||
        parsed.selection.geckoOriginTokenCount < 4 ||
        parsed.summary.geckoOriginTokenCount !== parsed.selection.geckoOriginTokenCount ||
        parsed.summary.firstSeenSourceSnapshotCount < 1 ||
        parsed.summary.enrichPendingCount < 1 ||
        parsed.summary.rescorePendingCount < 1 ||
        parsed.summary.metricPendingCount < 1 ||
        parsed.summary.notifyCandidateCount < 1 ||
        !Array.isArray(parsed.preview) ||
        parsed.preview.length === 0
      ) {
        throw new Error("geckoterminal review queue returned unexpected top-level summary");
      }

      if (
        !Array.isArray(parsed.queues.notifyCandidate) ||
        !Array.isArray(parsed.queues.highPriorityRecent) ||
        !Array.isArray(parsed.queues.staleReview) ||
        !Array.isArray(parsed.queues.rescorePending) ||
        !Array.isArray(parsed.queues.enrichPending) ||
        !Array.isArray(parsed.queues.metricPending)
      ) {
        throw new Error("geckoterminal review queue returned unexpected queue groups");
      }

      const notifyCandidateMints = new Set(
        parsed.queues.notifyCandidate.map((item) => item.mint),
      );
      const rescorePendingMints = new Set(
        parsed.queues.rescorePending.map((item) => item.mint),
      );
      const metricPendingMints = new Set(
        parsed.queues.metricPending.map((item) => item.mint),
      );

      if (
        !notifyCandidateMints.has(context.geckoEnrichRescoreMint) ||
        !rescorePendingMints.has(context.geckoEnrichRescoreCompleteMint) ||
        !metricPendingMints.has(context.geckoterminalDetectRunnerMint)
      ) {
        throw new Error("geckoterminal review queue did not include expected queue items");
      }

      if (
        parsed.preview.some(
          (item) =>
            !Array.isArray(item.queuesMatched) ||
            item.queuesMatched.length === 0 ||
            !Array.isArray(item.reviewReasons) ||
            typeof item.metricsCount !== "number",
        )
      ) {
        throw new Error("geckoterminal review queue preview returned unexpected item fields");
      }

      const pumpOnlyParsed = await runCliJson<{
        readOnly: boolean;
        selection: {
          sinceHours: number;
          limit: number;
          pumpOnly: boolean;
          staleAfterHours: number;
          geckoOriginTokenCount: number;
          skippedNonPumpCount: number;
        };
        summary: {
          geckoOriginTokenCount: number;
          enrichPendingCount: number;
        };
        queues: {
          enrichPending: Array<{
            mint: string;
          }>;
        };
        preview: Array<{
          mint: string;
        }>;
      }>(
        "geckoterminal review queue pump-only",
        "src/cli/geckoterminalReviewQueue.ts",
        [
          "--sinceHours",
          "24",
          "--limit",
          "50",
          "--pumpOnly",
        ],
        context.smokeId,
      );

      const [tokenCountAfterPumpOnly, metricCountAfterPumpOnly] = await Promise.all([
        db.token.count(),
        db.metric.count(),
      ]);

      const pumpOnlyEnrichPendingMints = new Set(
        pumpOnlyParsed.queues.enrichPending.map((item) => item.mint),
      );
      const pumpOnlyPreviewMints = new Set(pumpOnlyParsed.preview.map((item) => item.mint));

      if (
        tokenCountBefore !== tokenCountAfterPumpOnly ||
        metricCountBefore !== metricCountAfterPumpOnly
      ) {
        throw new Error("geckoterminal review queue pump-only was not read-only");
      }

      if (
        pumpOnlyParsed.readOnly !== true ||
        pumpOnlyParsed.selection.sinceHours !== 24 ||
        pumpOnlyParsed.selection.limit !== 50 ||
        pumpOnlyParsed.selection.pumpOnly !== true ||
        pumpOnlyParsed.selection.staleAfterHours !== 6 ||
        pumpOnlyParsed.selection.geckoOriginTokenCount < 1 ||
        pumpOnlyParsed.selection.skippedNonPumpCount < 1 ||
        pumpOnlyParsed.summary.geckoOriginTokenCount !==
          pumpOnlyParsed.selection.geckoOriginTokenCount ||
        pumpOnlyParsed.summary.enrichPendingCount < 1 ||
        !pumpOnlyEnrichPendingMints.has(context.geckoEnrichRescorePumpMint) ||
        pumpOnlyEnrichPendingMints.has(context.geckoEnrichRescoreNonPumpMint) ||
        pumpOnlyParsed.preview.length === 0 ||
        !pumpOnlyPreviewMints.has(context.geckoEnrichRescorePumpMint) ||
        pumpOnlyPreviewMints.has(context.geckoEnrichRescoreNonPumpMint) ||
        pumpOnlyParsed.preview.some((item) => !item.mint.endsWith("pump"))
      ) {
        throw new Error("geckoterminal review queue pump-only did not narrow the cohort");
      }

      const packageStdoutPath = `/tmp/${context.smokeId}-gecko-review-queue-package.stdout.json`;
      const packageStderrPath = `/tmp/${context.smokeId}-gecko-review-queue-package.stderr.log`;

      await rm(packageStdoutPath, { force: true });
      await rm(packageStderrPath, { force: true });

      await execFileAsync("bash", [
        "-lc",
        [
          "pnpm review:queue:geckoterminal -- --sinceHours 24 --limit 5",
          `> ${shellEscape(packageStdoutPath)}`,
          `2> ${shellEscape(packageStderrPath)}`,
        ].join(" "),
      ], {
        cwd: process.cwd(),
        env: process.env,
      });

      const packageRaw = (await readFile(packageStdoutPath, "utf-8")).trim();
      const jsonStartIndex = packageRaw.indexOf("{");
      if (jsonStartIndex < 0) {
        throw new Error("geckoterminal review queue package script did not emit JSON");
      }

      const packageParsed = parseJson<{
        readOnly: boolean;
        selection: {
          sinceHours: number;
          limit: number;
          pumpOnly: boolean;
        };
        summary: {
          geckoOriginTokenCount: number;
        };
      }>(
        "geckoterminal review queue package script",
        packageRaw.slice(jsonStartIndex),
      );

      if (
        packageParsed.readOnly !== true ||
        packageParsed.selection.sinceHours !== 24 ||
        packageParsed.selection.limit !== 5 ||
        packageParsed.selection.pumpOnly !== false ||
        packageParsed.summary.geckoOriginTokenCount < 1
      ) {
        throw new Error("geckoterminal review queue package script returned unexpected output");
      }

      await rm(packageStdoutPath, { force: true });
      await rm(packageStderrPath, { force: true });
    });

    await runStep("geckoterminal context capture", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;

      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "geckoterminal context capture import pump",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.geckoContextCapturePumpMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      await runCliJson<{
        mint: string;
        created: boolean;
      }>(
        "geckoterminal context capture import non-pump",
        "src/cli/importMint.ts",
        [
          "--mint",
          context.geckoContextCaptureNonPumpMint,
          "--source",
          "geckoterminal.new_pools",
        ],
        context.smokeId,
      );

      try {
        await writeFile(
          context.geckoContextCaptureFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.geckoContextCapturePumpMint}`,
                type: "token",
                attributes: {
                  address: context.geckoContextCapturePumpMint,
                  name: "context capture token",
                  symbol: "CCT",
                  description: "context capture description",
                  websites: ["https://example.com/project"],
                  twitter_username: "context_token",
                  telegram_handle: "contexttelegram",
                  discord_url: "https://discord.gg/context",
                },
              },
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.geckoContextCaptureFilePath;

        const [tokenCountBefore, metricCountBefore] = await Promise.all([
          db.token.count(),
          db.metric.count(),
        ]);

        const dryRunBatch = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          selection: {
            mint: string | null;
            sinceHours: number | null;
            pumpOnly: boolean;
            selectedCount: number;
            skippedNonPumpCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
            writeCount: number;
            availableDescriptionCount: number;
            availableWebsiteCount: number;
            availableXCount: number;
            availableTelegramCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
            selectedReason: string;
            savedContextPresentBefore: boolean;
            wouldWrite: boolean;
            writeSummary: {
              dryRun: boolean;
              updatedEntrySnapshot: boolean;
            };
            collectedContext?: {
              metadataText: {
                description: string | null;
              };
              links: {
                website: string | null;
                x: string | null;
                telegram: string | null;
              };
            };
          }>;
        }>(
          "geckoterminal context capture batch dry-run",
          "src/cli/contextCaptureGeckoterminal.ts",
          [
            "--limit",
            "5",
            "--sinceHours",
            "1",
          ],
          context.smokeId,
        );

        const [tokenCountAfterDryRun, metricCountAfterDryRun] = await Promise.all([
          db.token.count(),
          db.metric.count(),
        ]);

        if (
          tokenCountBefore !== tokenCountAfterDryRun ||
          metricCountBefore !== metricCountAfterDryRun
        ) {
          throw new Error("geckoterminal context capture dry-run was not read-only");
        }

        const dryRunBatchMints = new Set(dryRunBatch.items.map((item) => item.token.mint));
        const pumpDryRunItem = dryRunBatch.items.find(
          (item) => item.token.mint === context.geckoContextCapturePumpMint,
        );

        if (
          dryRunBatch.mode !== "recent_batch" ||
          dryRunBatch.dryRun !== true ||
          dryRunBatch.writeEnabled !== false ||
          dryRunBatch.selection.mint !== null ||
          dryRunBatch.selection.sinceHours !== 1 ||
          dryRunBatch.selection.pumpOnly !== true ||
          dryRunBatch.selection.selectedCount < 1 ||
          dryRunBatch.selection.skippedNonPumpCount < 1 ||
          dryRunBatch.summary.selectedCount !== dryRunBatch.items.length ||
          dryRunBatch.summary.okCount !== dryRunBatch.items.length ||
          dryRunBatch.summary.errorCount !== 0 ||
          dryRunBatch.summary.writeCount !== 0 ||
          dryRunBatch.summary.availableDescriptionCount < 1 ||
          dryRunBatch.summary.availableWebsiteCount < 1 ||
          dryRunBatch.summary.availableXCount < 1 ||
          dryRunBatch.summary.availableTelegramCount < 1 ||
          !dryRunBatchMints.has(context.geckoContextCapturePumpMint) ||
          dryRunBatchMints.has(context.geckoContextCaptureNonPumpMint) ||
          !pumpDryRunItem ||
          pumpDryRunItem.status !== "ok" ||
          pumpDryRunItem.selectedReason !== "Token.createdAt" ||
          pumpDryRunItem.savedContextPresentBefore !== false ||
          pumpDryRunItem.wouldWrite !== true ||
          pumpDryRunItem.writeSummary.dryRun !== true ||
          pumpDryRunItem.writeSummary.updatedEntrySnapshot !== false ||
          pumpDryRunItem.collectedContext?.metadataText.description !==
            "context capture description" ||
          pumpDryRunItem.collectedContext?.links.website !== "https://example.com/project" ||
          pumpDryRunItem.collectedContext?.links.x !== "https://x.com/context_token" ||
          pumpDryRunItem.collectedContext?.links.telegram !== "https://t.me/contexttelegram"
        ) {
          throw new Error("geckoterminal context capture dry-run returned unexpected output");
        }

        const tokenBeforeWrite = await db.token.findUnique({
          where: { mint: context.geckoContextCapturePumpMint },
          select: {
            entrySnapshot: true,
          },
        });

        if (!tokenBeforeWrite) {
          throw new Error("geckoterminal context capture pump token was not saved");
        }

        const entrySnapshotBeforeWrite =
          tokenBeforeWrite.entrySnapshot &&
          typeof tokenBeforeWrite.entrySnapshot === "object" &&
          !Array.isArray(tokenBeforeWrite.entrySnapshot)
            ? (tokenBeforeWrite.entrySnapshot as Record<string, unknown>)
            : null;

        if (
          entrySnapshotBeforeWrite?.contextCapture &&
          typeof entrySnapshotBeforeWrite.contextCapture === "object"
        ) {
          throw new Error("geckoterminal context capture dry-run unexpectedly wrote context");
        }

        const singleWrite = await runCliJson<{
          mode: string;
          dryRun: boolean;
          writeEnabled: boolean;
          selection: {
            mint: string | null;
            pumpOnly: boolean;
            selectedCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
            writeCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
            wouldWrite: boolean;
            writeSummary: {
              dryRun: boolean;
              updatedEntrySnapshot: boolean;
            };
          }>;
        }>(
          "geckoterminal context capture single write",
          "src/cli/contextCaptureGeckoterminal.ts",
          [
            "--mint",
            context.geckoContextCapturePumpMint,
            "--write",
          ],
          context.smokeId,
        );

        if (
          singleWrite.mode !== "single" ||
          singleWrite.dryRun !== false ||
          singleWrite.writeEnabled !== true ||
          singleWrite.selection.mint !== context.geckoContextCapturePumpMint ||
          singleWrite.selection.pumpOnly !== false ||
          singleWrite.selection.selectedCount !== 1 ||
          singleWrite.summary.selectedCount !== 1 ||
          singleWrite.summary.okCount !== 1 ||
          singleWrite.summary.errorCount !== 0 ||
          singleWrite.summary.writeCount !== 1 ||
          singleWrite.items.length !== 1 ||
          singleWrite.items[0]?.token.mint !== context.geckoContextCapturePumpMint ||
          singleWrite.items[0]?.status !== "ok" ||
          singleWrite.items[0]?.wouldWrite !== true ||
          singleWrite.items[0]?.writeSummary.dryRun !== false ||
          singleWrite.items[0]?.writeSummary.updatedEntrySnapshot !== true
        ) {
          throw new Error("geckoterminal context capture single write returned unexpected output");
        }

        const tokenAfterWrite = await db.token.findUnique({
          where: { mint: context.geckoContextCapturePumpMint },
          select: {
            entrySnapshot: true,
          },
        });

        const entrySnapshotAfterWrite =
          tokenAfterWrite?.entrySnapshot &&
          typeof tokenAfterWrite.entrySnapshot === "object" &&
          !Array.isArray(tokenAfterWrite.entrySnapshot)
            ? (tokenAfterWrite.entrySnapshot as Record<string, unknown>)
            : null;
        const contextCapture =
          entrySnapshotAfterWrite?.contextCapture &&
          typeof entrySnapshotAfterWrite.contextCapture === "object" &&
          !Array.isArray(entrySnapshotAfterWrite.contextCapture)
            ? (entrySnapshotAfterWrite.contextCapture as Record<string, unknown>)
            : null;
        const savedSnapshot =
          contextCapture?.geckoterminalTokenSnapshot &&
          typeof contextCapture.geckoterminalTokenSnapshot === "object" &&
          !Array.isArray(contextCapture.geckoterminalTokenSnapshot)
            ? (contextCapture.geckoterminalTokenSnapshot as Record<string, unknown>)
            : null;
        const savedMetadataText =
          savedSnapshot?.metadataText &&
          typeof savedSnapshot.metadataText === "object" &&
          !Array.isArray(savedSnapshot.metadataText)
            ? (savedSnapshot.metadataText as Record<string, unknown>)
            : null;
        const savedLinks =
          savedSnapshot?.links &&
          typeof savedSnapshot.links === "object" &&
          !Array.isArray(savedSnapshot.links)
            ? (savedSnapshot.links as Record<string, unknown>)
            : null;
        const savedPlaceholderLinks =
          entrySnapshotAfterWrite?.links &&
          typeof entrySnapshotAfterWrite.links === "object" &&
          !Array.isArray(entrySnapshotAfterWrite.links)
            ? (entrySnapshotAfterWrite.links as Record<string, unknown>)
            : null;

        if (
          !entrySnapshotAfterWrite ||
          entrySnapshotAfterWrite.stage !== "mint_only" ||
          !savedSnapshot ||
          savedSnapshot.source !== "geckoterminal.token_snapshot" ||
          savedMetadataText?.description !== "context capture description" ||
          savedLinks?.website !== "https://example.com/project" ||
          savedLinks?.x !== "https://x.com/context_token" ||
          savedLinks?.telegram !== "https://t.me/contexttelegram" ||
          !Array.isArray(savedLinks?.otherLinks) ||
          !(savedLinks.otherLinks as unknown[]).includes("https://discord.gg/context") ||
          savedPlaceholderLinks?.website !== null ||
          savedPlaceholderLinks?.x !== null ||
          savedPlaceholderLinks?.telegram !== null
        ) {
          throw new Error("geckoterminal context capture single write did not save expected entry snapshot context");
        }

        await writeFile(
          context.geckoContextCaptureFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.geckoContextCaptureNonPumpMint}`,
                type: "token",
                attributes: {
                  address: context.geckoContextCaptureNonPumpMint,
                  name: "non pump context capture",
                  symbol: "NPCC",
                },
              },
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );

        const nonPumpSingle = await runCliJson<{
          mode: string;
          selection: {
            mint: string | null;
            pumpOnly: boolean;
            selectedCount: number;
          };
          summary: {
            selectedCount: number;
            okCount: number;
            errorCount: number;
          };
          items: Array<{
            token: {
              mint: string;
            };
            status: string;
          }>;
        }>(
          "geckoterminal context capture single non-pump",
          "src/cli/contextCaptureGeckoterminal.ts",
          [
            "--mint",
            context.geckoContextCaptureNonPumpMint,
          ],
          context.smokeId,
        );

        if (
          nonPumpSingle.mode !== "single" ||
          nonPumpSingle.selection.mint !== context.geckoContextCaptureNonPumpMint ||
          nonPumpSingle.selection.pumpOnly !== false ||
          nonPumpSingle.selection.selectedCount !== 1 ||
          nonPumpSingle.summary.selectedCount !== 1 ||
          nonPumpSingle.summary.okCount !== 1 ||
          nonPumpSingle.summary.errorCount !== 0 ||
          nonPumpSingle.items.length !== 1 ||
          nonPumpSingle.items[0]?.token.mint !== context.geckoContextCaptureNonPumpMint ||
          nonPumpSingle.items[0]?.status !== "ok"
        ) {
          throw new Error(
            "geckoterminal context capture single non-pump should remain available outside pump-only batch mode",
          );
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }
      }
    });

    await runStep("geckoterminal context compare", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
      const previousSnapshotWithTopPoolsFile =
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE;

      try {
        await writeFile(
          context.geckoContextCaptureFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.geckoContextCapturePumpMint}`,
                type: "token",
                attributes: {
                  address: context.geckoContextCapturePumpMint,
                  name: "context capture token",
                  symbol: "CCT",
                  description: "context capture description",
                  websites: ["https://example.com/project"],
                  twitter_username: "context_token",
                  telegram_handle: "contexttelegram",
                  discord_url: "https://discord.gg/context",
                },
              },
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.geckoContextCaptureFilePath;
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE =
          context.geckoContextCaptureFilePath;

        const [tokenCountBefore, metricCountBefore] = await Promise.all([
          db.token.count(),
          db.metric.count(),
        ]);

        const parsed = await runCliJson<{
          readOnly: boolean;
          selection: {
            sinceHours: number;
            limit: number;
            geckoOriginTokenCount: number;
            skippedNonPumpCount: number;
            selectedCount: number;
          };
          comparedSources: Array<{
            id: string;
            endpoint: string;
          }>;
          availabilitySummary: Array<{
            sourceId: string;
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
            sourceResults: Array<{
              sourceId: string;
              status: string;
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
            }>;
          }>;
        }>(
          "geckoterminal context compare",
          "src/cli/contextCompareGeckoterminal.ts",
          [
            "--limit",
            "1",
            "--sinceHours",
            "1",
          ],
          context.smokeId,
        );

        const [tokenCountAfter, metricCountAfter] = await Promise.all([
          db.token.count(),
          db.metric.count(),
        ]);

        if (tokenCountBefore !== tokenCountAfter || metricCountBefore !== metricCountAfter) {
          throw new Error("geckoterminal context compare was not read-only");
        }

        const summaryBySource = new Map(
          parsed.availabilitySummary.map((item) => [item.sourceId, item] as const),
        );
        const plainSummary = summaryBySource.get("geckoterminal.token_snapshot");
        const withTopPoolsSummary = summaryBySource.get(
          "geckoterminal.token_snapshot_with_top_pools",
        );
        const sample = parsed.sampleResults[0];
        const sampleSourceIds = new Set(sample?.sourceResults.map((item) => item.sourceId) ?? []);

        if (
          parsed.readOnly !== true ||
          parsed.selection.sinceHours !== 1 ||
          parsed.selection.limit !== 1 ||
          parsed.selection.geckoOriginTokenCount < 1 ||
          parsed.selection.skippedNonPumpCount < 1 ||
          parsed.selection.selectedCount !== 1 ||
          parsed.comparedSources.length !== 2 ||
          !plainSummary ||
          !withTopPoolsSummary ||
          plainSummary.totalChecked !== 1 ||
          plainSummary.okCount !== 1 ||
          plainSummary.fetchErrorCount !== 0 ||
          plainSummary.rateLimitedCount !== 0 ||
          plainSummary.nameAvailableCount !== 1 ||
          plainSummary.symbolAvailableCount !== 1 ||
          plainSummary.descriptionAvailableCount !== 1 ||
          plainSummary.websiteAvailableCount !== 1 ||
          plainSummary.xAvailableCount !== 1 ||
          plainSummary.telegramAvailableCount !== 1 ||
          plainSummary.anyLinksAvailableCount !== 1 ||
          withTopPoolsSummary.totalChecked !== 1 ||
          withTopPoolsSummary.okCount !== 1 ||
          withTopPoolsSummary.fetchErrorCount !== 0 ||
          withTopPoolsSummary.rateLimitedCount !== 0 ||
          withTopPoolsSummary.nameAvailableCount !== 1 ||
          withTopPoolsSummary.symbolAvailableCount !== 1 ||
          withTopPoolsSummary.descriptionAvailableCount !== 1 ||
          withTopPoolsSummary.websiteAvailableCount !== 1 ||
          withTopPoolsSummary.xAvailableCount !== 1 ||
          withTopPoolsSummary.telegramAvailableCount !== 1 ||
          withTopPoolsSummary.anyLinksAvailableCount !== 1 ||
          parsed.sampleResults.length !== 1 ||
          sample?.mint !== context.geckoContextCapturePumpMint ||
          sample.sourceResults.length !== 2 ||
          !sampleSourceIds.has("geckoterminal.token_snapshot") ||
          !sampleSourceIds.has("geckoterminal.token_snapshot_with_top_pools") ||
          sample.sourceResults.some(
            (item) =>
              item.status !== "ok" ||
              item.rateLimited !== false ||
              item.metadata?.description !== "context capture description" ||
              item.links?.website !== "https://example.com/project" ||
              item.links?.x !== "https://x.com/context_token" ||
              item.links?.telegram !== "https://t.me/contexttelegram" ||
              item.links?.anyLinks !== true,
          )
        ) {
          throw new Error("geckoterminal context compare returned unexpected output");
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }

        if (previousSnapshotWithTopPoolsFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE =
            previousSnapshotWithTopPoolsFile;
        }
      }
    });

    await runStep("context source family compare", async () => {
      const previousSnapshotFile = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
      const previousSnapshotWithTopPoolsFile =
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE;
      const previousDexscreenerProfilesFile =
        process.env.DEXSCREENER_TOKEN_PROFILES_LATEST_V1_FILE;

      try {
        await writeFile(
          context.geckoContextCaptureFilePath,
          `${JSON.stringify(
            {
              data: {
                id: `solana_${context.geckoContextCapturePumpMint}`,
                type: "token",
                attributes: {
                  address: context.geckoContextCapturePumpMint,
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
          )}\n`,
          "utf-8",
        );

        await writeFile(
          context.dexscreenerContextCompareFilePath,
          `${JSON.stringify(
            [
              {
                tokenAddress: context.geckoContextCapturePumpMint,
                chainId: "solana",
                description: "dex context description",
                links: [
                  {
                    type: "website",
                    url: "https://example.com/dex-context",
                  },
                  {
                    type: "twitter",
                    url: "https://x.com/dex_context",
                  },
                  {
                    type: "telegram",
                    url: "https://t.me/dexcontext",
                  },
                ],
              },
            ],
            null,
            2,
          )}\n`,
          "utf-8",
        );

        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = context.geckoContextCaptureFilePath;
        process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE =
          context.geckoContextCaptureFilePath;
        process.env.DEXSCREENER_TOKEN_PROFILES_LATEST_V1_FILE =
          context.dexscreenerContextCompareFilePath;

        const [tokenCountBefore, metricCountBefore] = await Promise.all([
          db.token.count(),
          db.metric.count(),
        ]);

        const parsed = await runCliJson<{
          readOnly: boolean;
          selection: {
            sinceHours: number;
            limit: number;
            geckoOriginTokenCount: number;
            skippedNonPumpCount: number;
            selectedCount: number;
          };
          comparedSources: Array<{
            id: string;
            family: string;
          }>;
          availabilitySummary: Array<{
            sourceId: string;
            family: string;
            totalChecked: number;
            okCount: number;
            notFoundCount: number;
            fetchErrorCount: number;
            rateLimitedCount: number;
            descriptionAvailableCount: number;
            websiteAvailableCount: number;
            xAvailableCount: number;
            telegramAvailableCount: number;
            anyLinksAvailableCount: number;
          }>;
          sampleResults: Array<{
            mint: string;
            sourceResults: Array<{
              sourceId: string;
              family: string;
              status: string;
              rateLimited: boolean;
              metadata: {
                description: string | null;
              } | null;
              links: {
                website: string | null;
                x: string | null;
                telegram: string | null;
                anyLinks: boolean;
              } | null;
            }>;
          }>;
        }>(
          "context source family compare",
          "src/cli/contextCompareSourceFamilies.ts",
          [
            "--limit",
            "1",
            "--sinceHours",
            "1",
          ],
          context.smokeId,
        );

        const [tokenCountAfter, metricCountAfter] = await Promise.all([
          db.token.count(),
          db.metric.count(),
        ]);

        if (tokenCountBefore !== tokenCountAfter || metricCountBefore !== metricCountAfter) {
          throw new Error("context source family compare was not read-only");
        }

        const summaryBySource = new Map(
          parsed.availabilitySummary.map((item) => [item.sourceId, item] as const),
        );
        const geckoPlainSummary = summaryBySource.get("geckoterminal.token_snapshot");
        const geckoTopPoolsSummary = summaryBySource.get(
          "geckoterminal.token_snapshot_with_top_pools",
        );
        const dexscreenerSummary = summaryBySource.get("dexscreener.token_profiles_latest_v1");
        const sample = parsed.sampleResults[0];
        const sampleSourceIds = new Set(sample?.sourceResults.map((item) => item.sourceId) ?? []);

        if (
          parsed.readOnly !== true ||
          parsed.selection.sinceHours !== 1 ||
          parsed.selection.limit !== 1 ||
          parsed.selection.geckoOriginTokenCount < 1 ||
          parsed.selection.skippedNonPumpCount < 1 ||
          parsed.selection.selectedCount !== 1 ||
          parsed.comparedSources.length !== 3 ||
          !geckoPlainSummary ||
          !geckoTopPoolsSummary ||
          !dexscreenerSummary ||
          geckoPlainSummary.okCount !== 1 ||
          geckoPlainSummary.descriptionAvailableCount !== 1 ||
          geckoPlainSummary.websiteAvailableCount !== 1 ||
          geckoPlainSummary.xAvailableCount !== 1 ||
          geckoPlainSummary.telegramAvailableCount !== 1 ||
          geckoPlainSummary.anyLinksAvailableCount !== 1 ||
          geckoTopPoolsSummary.okCount !== 1 ||
          geckoTopPoolsSummary.descriptionAvailableCount !== 1 ||
          geckoTopPoolsSummary.websiteAvailableCount !== 1 ||
          geckoTopPoolsSummary.xAvailableCount !== 1 ||
          geckoTopPoolsSummary.telegramAvailableCount !== 1 ||
          geckoTopPoolsSummary.anyLinksAvailableCount !== 1 ||
          dexscreenerSummary.okCount !== 1 ||
          dexscreenerSummary.notFoundCount !== 0 ||
          dexscreenerSummary.fetchErrorCount !== 0 ||
          dexscreenerSummary.rateLimitedCount !== 0 ||
          dexscreenerSummary.descriptionAvailableCount !== 1 ||
          dexscreenerSummary.websiteAvailableCount !== 1 ||
          dexscreenerSummary.xAvailableCount !== 1 ||
          dexscreenerSummary.telegramAvailableCount !== 1 ||
          dexscreenerSummary.anyLinksAvailableCount !== 1 ||
          parsed.sampleResults.length !== 1 ||
          sample?.mint !== context.geckoContextCapturePumpMint ||
          sample.sourceResults.length !== 3 ||
          !sampleSourceIds.has("geckoterminal.token_snapshot") ||
          !sampleSourceIds.has("geckoterminal.token_snapshot_with_top_pools") ||
          !sampleSourceIds.has("dexscreener.token_profiles_latest_v1") ||
          sample.sourceResults.some(
            (item) =>
              item.status !== "ok" ||
              item.rateLimited !== false ||
              (item.family === "dexscreener" &&
                (item.metadata?.description !== "dex context description" ||
                  item.links?.website !== "https://example.com/dex-context" ||
                  item.links?.x !== "https://x.com/dex_context" ||
                  item.links?.telegram !== "https://t.me/dexcontext" ||
                  item.links?.anyLinks !== true)) ||
              (item.family === "geckoterminal" &&
                (item.metadata?.description !== "context capture description" ||
                  item.links?.website !== "https://example.com/project" ||
                  item.links?.x !== "https://x.com/context_token" ||
                  item.links?.telegram !== "https://t.me/contexttelegram" ||
                  item.links?.anyLinks !== true)),
          )
        ) {
          throw new Error("context source family compare returned unexpected output");
        }
      } finally {
        if (previousSnapshotFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE = previousSnapshotFile;
        }

        if (previousSnapshotWithTopPoolsFile === undefined) {
          delete process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE;
        } else {
          process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE =
            previousSnapshotWithTopPoolsFile;
        }

        if (previousDexscreenerProfilesFile === undefined) {
          delete process.env.DEXSCREENER_TOKEN_PROFILES_LATEST_V1_FILE;
        } else {
          process.env.DEXSCREENER_TOKEN_PROFILES_LATEST_V1_FILE =
            previousDexscreenerProfilesFile;
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
