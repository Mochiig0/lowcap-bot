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
  mintHappyPathMint: string;
  minMint: string;
  fileMint: string;
  metricMint: string;
  metricId: number | null;
  devWallet: string;
  trendRaw: string;
  trendGeneratedAt: string;
  fileImportPath: string;
  mintBatchFilePath: string;
  mintBatchDuplicateFilePath: string;
  mintBatchRerunFilePath: string;
  mintSourceEventFilePath: string;
  mintHappyPathFilePath: string;
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
          context.mintHappyPathMint,
          context.minMint,
          context.fileMint,
          context.metricMint,
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
          context.mintHappyPathMint,
          context.minMint,
          context.fileMint,
          context.metricMint,
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
  await rm(context.mintHappyPathFilePath, { force: true });
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
    mintHappyPathMint: `${smokeId}_HAPPY_PATH`,
    minMint: `${smokeId}_MIN`,
    fileMint: `${smokeId}_FILE`,
    metricMint: `${smokeId}_METRIC`,
    metricId: null,
    devWallet: `${smokeId}_DEV`,
    trendRaw: await readFile(TREND_PATH, "utf-8"),
    trendGeneratedAt: "",
    fileImportPath: `/tmp/${smokeId}-import-file.json`,
    mintBatchFilePath: `/tmp/${smokeId}-import-mint-file.json`,
    mintBatchDuplicateFilePath: `/tmp/${smokeId}-import-mint-file-duplicate.json`,
    mintBatchRerunFilePath: `/tmp/${smokeId}-import-mint-file-rerun.json`,
    mintSourceEventFilePath: `/tmp/${smokeId}-import-mint-source-file.json`,
    mintHappyPathFilePath: `/tmp/${smokeId}-mint-happy-path-source-file.json`,
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
        enriched.source !== "smoke-happy-path-source" ||
        enriched.metadataStatus !== "enriched"
      ) {
        throw new Error("mint-driven happy path enrich returned unexpected status or source");
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
        compared.currentToken.source !== "smoke-happy-path-source" ||
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
      const parsed = await runCliJson<{
        mint: string;
        metadataStatus: string;
        latestMetric: { id: number } | null;
      }>(
        "token show",
        "src/cli/tokenShow.ts",
        [
          "--mint",
          context.metricMint,
        ],
        context.smokeId,
      );

      if (parsed.mint !== context.metricMint) {
        throw new Error("token show returned unexpected mint");
      }

      if (parsed.metadataStatus !== "mint_only") {
        throw new Error("token show did not include metadataStatus");
      }

      if (!parsed.latestMetric) {
        throw new Error("token show did not include latestMetric");
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
