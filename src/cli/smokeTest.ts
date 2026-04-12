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
  minMint: string;
  fileMint: string;
  metricMint: string;
  metricId: number | null;
  devWallet: string;
  trendRaw: string;
  trendGeneratedAt: string;
  fileImportPath: string;
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
    minMint: `${smokeId}_MIN`,
    fileMint: `${smokeId}_FILE`,
    metricMint: `${smokeId}_METRIC`,
    metricId: null,
    devWallet: `${smokeId}_DEV`,
    trendRaw: await readFile(TREND_PATH, "utf-8"),
    trendGeneratedAt: "",
    fileImportPath: `/tmp/${smokeId}-import-file.json`,
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

    await runStep("tokens compare report", async () => {
      const parsed = await runCliJson<{
        count: number;
        items: Array<{
          mint: string;
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
        items: Array<{ token: { mint: string } }>;
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
