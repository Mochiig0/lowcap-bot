import { execFile as nodeExecFile } from "node:child_process";

type JsonObject = Record<string, unknown>;

const METRIC_APPEND_EXEC_FILE_MAX_BUFFER = 10 * 1024 * 1024;

export type GeckoMetricAppendCommandPlan = {
  command: "pnpm";
  script: "metric:snapshot:geckoterminal";
  args: string[];
  mint: string;
  cycle: number;
  orderInCycle: number;
  metricAppend: true;
  postCheck: true;
};

export type GeckoMetricAppendRunnerInput = {
  command: "pnpm";
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  mint: string;
  cycle: number;
  orderInCycle: number;
  metricAppend: true;
  postCheck: true;
};

export type GeckoMetricAppendCommandStatus =
  | "ok"
  | "cli_error"
  | "parse_error"
  | "item_error"
  | "skipped_recent_metric"
  | "unexpected_output";

export type GeckoMetricAppendCommandWriteSummary = {
  dryRun: boolean;
  wouldCreateMetric: boolean;
  metricId: number | null;
};

export type GeckoMetricAppendCommandParsedOutput = JsonObject & {
  summary?: JsonObject;
  items?: unknown[];
};

export type GeckoMetricAppendCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parsedOutput: GeckoMetricAppendCommandParsedOutput | null;
  parseError: string | null;
  status: GeckoMetricAppendCommandStatus;
  metricSource: string | null;
  selectedCount: number;
  okCount: number;
  skippedCount: number;
  errorCount: number;
  writtenCount: number;
  writeSummary: GeckoMetricAppendCommandWriteSummary | null;
  itemStatus: string | null;
  itemError: string | null;
  rateLimited: boolean;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
};

export type GeckoCatchupMetricAppendExecutionResult = {
  mint: string;
  cycle: number;
  orderInCycle: number;
  status: GeckoMetricAppendCommandStatus;
  exitCode: number | null;
  metricSource: string | null;
  selectedCount: number;
  okCount: number;
  skippedCount: number;
  errorCount: number;
  writtenCount: number;
  writeSummary: GeckoMetricAppendCommandWriteSummary | null;
  itemStatus: string | null;
  itemError: string | null;
  rateLimited: boolean;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  parseError: string | null;
};

export type GeckoMetricAppendCommandRunner = (
  input: GeckoMetricAppendRunnerInput,
) => Promise<GeckoMetricAppendCommandResult>;

export type GeckoMetricAppendExecFile = (
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  },
) => Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>;

type MetricAppendCommandRawResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type BuildGeckoMetricAppendRunnerInputOptions = {
  cwd: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
};

export function buildMetricAppendCommandArgs(mint: string): string[] {
  return [
    "metric:snapshot:geckoterminal",
    "--",
    "--mint",
    mint,
    "--write",
  ];
}

function normalizeEnv(env: Record<string, string | undefined> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!env) {
    return normalized;
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

function assertMetricAppendCommandPlan(plan: GeckoMetricAppendCommandPlan): void {
  if (plan.command !== "pnpm") {
    throw new Error(`Unsupported metric append command: ${plan.command}`);
  }
  if (plan.script !== "metric:snapshot:geckoterminal") {
    throw new Error(`Unsupported metric append script: ${plan.script}`);
  }
  if (plan.metricAppend !== true) {
    throw new Error("Metric append runner input requires metricAppend=true");
  }
  if (plan.postCheck !== true) {
    throw new Error("Metric append runner input requires postCheck=true");
  }
  if (!plan.args.includes("--write")) {
    throw new Error("Metric append runner input requires --write");
  }
  if (plan.args.includes("--watch")) {
    throw new Error("Metric append runner input does not support watch");
  }
  if (plan.args.includes("--limit") || plan.args.includes("--sinceMinutes")) {
    throw new Error("Metric append runner input supports single mint only");
  }

  const mintArgIndex = plan.args.indexOf("--mint");
  if (mintArgIndex < 0 || plan.args[mintArgIndex + 1] !== plan.mint) {
    throw new Error("Metric append runner input requires matching --mint");
  }
  if (plan.args.some((arg) => arg.startsWith("token:"))) {
    throw new Error("Metric append runner input does not support token write");
  }
}

export function buildGeckoMetricAppendRunnerInput(
  plan: GeckoMetricAppendCommandPlan,
  options: BuildGeckoMetricAppendRunnerInputOptions,
): GeckoMetricAppendRunnerInput {
  assertMetricAppendCommandPlan(plan);

  return {
    command: plan.command,
    args: [...plan.args],
    cwd: options.cwd,
    env: normalizeEnv(options.env),
    timeoutMs: options.timeoutMs ?? 60_000,
    mint: plan.mint,
    cycle: plan.cycle,
    orderInCycle: plan.orderInCycle,
    metricAppend: true,
    postCheck: true,
  };
}

export async function runGeckoMetricAppendCommandWithRunner(
  runner: GeckoMetricAppendCommandRunner,
  input: GeckoMetricAppendRunnerInput,
): Promise<GeckoMetricAppendCommandResult> {
  return runner(input);
}

export async function runGeckoMetricAppendCommandWithExecFile(
  execFile: GeckoMetricAppendExecFile,
  input: GeckoMetricAppendRunnerInput,
): Promise<GeckoMetricAppendCommandResult> {
  const rawResult = await execFile(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    timeoutMs: input.timeoutMs,
  });

  return parseGeckoMetricAppendCommandResult(rawResult);
}

function readExecFileExitCode(error: Error | null): number | null {
  if (!error) {
    return 0;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

function readExecFileOutput(output: string | Buffer | undefined): string {
  if (typeof output === "string") {
    return output;
  }
  return output?.toString("utf8") ?? "";
}

function readExecFileStderr(error: Error | null, stderr: string | Buffer | undefined): string {
  const stderrText = readExecFileOutput(stderr);
  if (stderrText.length > 0 || !error) {
    return stderrText;
  }

  return error.message;
}

const nodeExecFileAdapter: GeckoMetricAppendExecFile = (command, args, options) =>
  new Promise((resolve) => {
    nodeExecFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        maxBuffer: METRIC_APPEND_EXEC_FILE_MAX_BUFFER,
        timeout: options.timeoutMs,
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode: readExecFileExitCode(error),
          stdout: readExecFileOutput(stdout),
          stderr: readExecFileStderr(error, stderr),
        });
      },
    );
  });

export async function runGeckoMetricAppendCommandWithNodeExecFile(
  input: GeckoMetricAppendRunnerInput,
): Promise<GeckoMetricAppendCommandResult> {
  return runGeckoMetricAppendCommandWithExecFile(nodeExecFileAdapter, input);
}

export function toGeckoCatchupMetricAppendExecutionResult(
  input: GeckoMetricAppendRunnerInput,
  result: GeckoMetricAppendCommandResult,
): GeckoCatchupMetricAppendExecutionResult {
  return {
    mint: input.mint,
    cycle: input.cycle,
    orderInCycle: input.orderInCycle,
    status: result.status,
    exitCode: result.exitCode,
    metricSource: result.metricSource,
    selectedCount: result.selectedCount,
    okCount: result.okCount,
    skippedCount: result.skippedCount,
    errorCount: result.errorCount,
    writtenCount: result.writtenCount,
    writeSummary: result.writeSummary,
    itemStatus: result.itemStatus,
    itemError: result.itemError,
    rateLimited: result.rateLimited,
    abortedDueToRateLimit: result.abortedDueToRateLimit,
    skippedAfterRateLimit: result.skippedAfterRateLimit,
    parseError: result.parseError,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractFirstJsonObjectText(stdout: string): string | null {
  const start = stdout.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < stdout.length; index += 1) {
    const char = stdout[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return stdout.slice(start, index + 1);
      }
    }
  }

  return stdout.slice(start);
}

function parseStdoutJson(stdout: string): {
  parsedOutput: GeckoMetricAppendCommandParsedOutput | null;
  parseError: string | null;
} {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return {
      parsedOutput: null,
      parseError: "stdout was empty",
    };
  }

  const jsonText = extractFirstJsonObjectText(trimmed);
  if (jsonText === null) {
    return {
      parsedOutput: null,
      parseError: "stdout JSON object not found",
    };
  }

  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!isJsonObject(parsed)) {
      return {
        parsedOutput: null,
        parseError: "stdout JSON must be an object",
      };
    }

    return {
      parsedOutput: parsed as GeckoMetricAppendCommandParsedOutput,
      parseError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      parsedOutput: null,
      parseError: `stdout JSON parse failed: ${message}`,
    };
  }
}

function getFirstItem(parsedOutput: GeckoMetricAppendCommandParsedOutput | null): JsonObject | null {
  const items = parsedOutput?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return isJsonObject(items[0]) ? items[0] : null;
}

function readWriteSummary(item: JsonObject | null): GeckoMetricAppendCommandWriteSummary | null {
  const writeSummary = item?.writeSummary;
  if (!isJsonObject(writeSummary)) {
    return null;
  }

  return {
    dryRun: readBoolean(writeSummary.dryRun),
    wouldCreateMetric: readBoolean(writeSummary.wouldCreateMetric),
    metricId: readNullableNumber(writeSummary.metricId),
  };
}

function isRateLimitErrorMessage(message: string | null): boolean {
  return typeof message === "string" && message.includes("429 Too Many Requests");
}

function buildCommandStatus(params: {
  exitCode: number | null;
  parsedOutput: GeckoMetricAppendCommandParsedOutput | null;
  selectedCount: number;
  writtenCount: number;
  writeSummary: GeckoMetricAppendCommandWriteSummary | null;
  itemStatus: string | null;
  itemError: string | null;
}): GeckoMetricAppendCommandStatus {
  if (params.exitCode !== 0) {
    return "cli_error";
  }
  if (params.parsedOutput === null) {
    return "parse_error";
  }
  if (params.itemStatus === "error") {
    return "item_error";
  }
  if (params.itemStatus === "skipped_recent_metric") {
    return "skipped_recent_metric";
  }
  if (
    params.itemStatus === "ok" &&
    readBoolean(params.parsedOutput.writeEnabled) &&
    params.selectedCount === 1 &&
    params.writtenCount === 1 &&
    params.writeSummary?.metricId !== null &&
    params.writeSummary?.metricId !== undefined
  ) {
    return "ok";
  }
  if (params.itemError !== null) {
    return "item_error";
  }
  return "unexpected_output";
}

export function parseGeckoMetricAppendCommandResult(
  input: MetricAppendCommandRawResult,
): GeckoMetricAppendCommandResult {
  const { parsedOutput, parseError } = parseStdoutJson(input.stdout);
  const summary = isJsonObject(parsedOutput?.summary) ? parsedOutput.summary : null;
  const firstItem = getFirstItem(parsedOutput);
  const writeSummary = readWriteSummary(firstItem);
  const itemError = readString(firstItem?.error);
  const itemStatus = readString(firstItem?.status);
  const selectedCount = readNumber(summary?.selectedCount);
  const okCount = readNumber(summary?.okCount);
  const skippedCount = readNumber(summary?.skippedCount);
  const errorCount = readNumber(summary?.errorCount);
  const writtenCount = readNumber(summary?.writtenCount);
  const rateLimited =
    readBoolean(summary?.rateLimited) ||
    isRateLimitErrorMessage(itemError);
  const status = buildCommandStatus({
    exitCode: input.exitCode,
    parsedOutput,
    selectedCount,
    writtenCount,
    writeSummary,
    itemStatus,
    itemError,
  });

  return {
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    parsedOutput,
    parseError,
    status,
    metricSource: readString(parsedOutput?.metricSource) ?? readString(firstItem?.metricSource),
    selectedCount,
    okCount,
    skippedCount,
    errorCount,
    writtenCount,
    writeSummary,
    itemStatus,
    itemError,
    rateLimited,
    abortedDueToRateLimit: readBoolean(summary?.abortedDueToRateLimit),
    skippedAfterRateLimit: readNumber(summary?.skippedAfterRateLimit),
  };
}
