import { execFile as nodeExecFile } from "node:child_process";

type JsonObject = Record<string, unknown>;

const TOKEN_WRITE_EXEC_FILE_MAX_BUFFER = 10 * 1024 * 1024;

export type GeckoTokenWriteCommandPlan = {
  command: "pnpm";
  script: "token:enrich-rescore:geckoterminal";
  args: string[];
  mint: string;
  cycle: number;
  orderInCycle: number;
  notify: false;
  metricAppend: false;
  postCheck: true;
};

export type GeckoTokenWriteRunnerInput = {
  command: "pnpm";
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  mint: string;
  cycle: number;
  orderInCycle: number;
  notify: false;
  metricAppend: false;
  postCheck: true;
};

export type GeckoTokenWriteCommandStatus = "ok" | "cli_error" | "parse_error";

export type GeckoTokenWriteCommandWriteSummary = {
  enrichUpdated: boolean;
  rescoreUpdated: boolean;
  contextUpdated: boolean;
  metaplexContextUpdated: boolean;
};

export type GeckoTokenWriteCommandParsedOutput = JsonObject & {
  summary?: JsonObject;
  items?: unknown[];
};

export type GeckoTokenWriteCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parsedOutput: GeckoTokenWriteCommandParsedOutput | null;
  parseError: string | null;
  status: GeckoTokenWriteCommandStatus;
  rateLimited: boolean;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  writeSummary: GeckoTokenWriteCommandWriteSummary | null;
  notifySent: boolean;
  itemError: string | null;
  metaplexErrorKind: string | null;
};

export type GeckoTokenWriteCommandRunner = (
  input: GeckoTokenWriteRunnerInput,
) => Promise<GeckoTokenWriteCommandResult>;

export type GeckoTokenWriteExecFile = (
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

type TokenWriteCommandRawResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type BuildGeckoTokenWriteRunnerInputOptions = {
  cwd: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
};

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

function assertTokenOnlyWriteCommandPlan(plan: GeckoTokenWriteCommandPlan): void {
  if (plan.command !== "pnpm") {
    throw new Error(`Unsupported token write command: ${plan.command}`);
  }
  if (plan.script !== "token:enrich-rescore:geckoterminal") {
    throw new Error(`Unsupported token write script: ${plan.script}`);
  }
  if (plan.notify !== false || plan.args.includes("--notify")) {
    throw new Error("Token write runner input does not support notify");
  }
  if (plan.metricAppend !== false || plan.args.some((arg) => arg.includes("metric"))) {
    throw new Error("Token write runner input does not support metric append");
  }
  if (plan.postCheck !== true) {
    throw new Error("Token write runner input requires postCheck=true");
  }
}

export function buildGeckoTokenWriteRunnerInput(
  plan: GeckoTokenWriteCommandPlan,
  options: BuildGeckoTokenWriteRunnerInputOptions,
): GeckoTokenWriteRunnerInput {
  assertTokenOnlyWriteCommandPlan(plan);

  return {
    command: plan.command,
    args: [...plan.args],
    cwd: options.cwd,
    env: normalizeEnv(options.env),
    timeoutMs: options.timeoutMs ?? 60_000,
    mint: plan.mint,
    cycle: plan.cycle,
    orderInCycle: plan.orderInCycle,
    notify: false,
    metricAppend: false,
    postCheck: true,
  };
}

export async function runGeckoTokenWriteCommandWithRunner(
  runner: GeckoTokenWriteCommandRunner,
  input: GeckoTokenWriteRunnerInput,
): Promise<GeckoTokenWriteCommandResult> {
  return runner(input);
}

export async function runGeckoTokenWriteCommandWithExecFile(
  execFile: GeckoTokenWriteExecFile,
  input: GeckoTokenWriteRunnerInput,
): Promise<GeckoTokenWriteCommandResult> {
  const rawResult = await execFile(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    timeoutMs: input.timeoutMs,
  });

  return parseGeckoTokenWriteCommandResult(rawResult);
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

const nodeExecFileAdapter: GeckoTokenWriteExecFile = (command, args, options) =>
  new Promise((resolve) => {
    nodeExecFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        maxBuffer: TOKEN_WRITE_EXEC_FILE_MAX_BUFFER,
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

export async function runGeckoTokenWriteCommandWithNodeExecFile(
  input: GeckoTokenWriteRunnerInput,
): Promise<GeckoTokenWriteCommandResult> {
  return runGeckoTokenWriteCommandWithExecFile(nodeExecFileAdapter, input);
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

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseStdoutJson(stdout: string): {
  parsedOutput: GeckoTokenWriteCommandParsedOutput | null;
  parseError: string | null;
} {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return {
      parsedOutput: null,
      parseError: "stdout was empty",
    };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isJsonObject(parsed)) {
      return {
        parsedOutput: null,
        parseError: "stdout JSON must be an object",
      };
    }

    return {
      parsedOutput: parsed as GeckoTokenWriteCommandParsedOutput,
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

function getFirstItem(parsedOutput: GeckoTokenWriteCommandParsedOutput | null): JsonObject | null {
  const items = parsedOutput?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return isJsonObject(items[0]) ? items[0] : null;
}

function readWriteSummary(item: JsonObject | null): GeckoTokenWriteCommandWriteSummary | null {
  const writeSummary = item?.writeSummary;
  if (!isJsonObject(writeSummary)) {
    return null;
  }

  return {
    enrichUpdated: readBoolean(writeSummary.enrichUpdated),
    rescoreUpdated: readBoolean(writeSummary.rescoreUpdated),
    contextUpdated: readBoolean(writeSummary.contextUpdated),
    metaplexContextUpdated: readBoolean(writeSummary.metaplexContextUpdated),
  };
}

function buildCommandStatus(
  exitCode: number | null,
  parsedOutput: GeckoTokenWriteCommandParsedOutput | null,
): GeckoTokenWriteCommandStatus {
  if (exitCode === 0 && parsedOutput !== null) {
    return "ok";
  }
  if (exitCode === 0) {
    return "parse_error";
  }
  return "cli_error";
}

export function parseGeckoTokenWriteCommandResult(
  input: TokenWriteCommandRawResult,
): GeckoTokenWriteCommandResult {
  const { parsedOutput, parseError } = parseStdoutJson(input.stdout);
  const summary = isJsonObject(parsedOutput?.summary) ? parsedOutput.summary : null;
  const firstItem = getFirstItem(parsedOutput);
  const writeSummary = readWriteSummary(firstItem);
  const notifySent =
    readBoolean(firstItem?.notifySent) || readNumber(summary?.notifySentCount) > 0;

  return {
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    parsedOutput,
    parseError,
    status: buildCommandStatus(input.exitCode, parsedOutput),
    rateLimited: readBoolean(summary?.rateLimited),
    abortedDueToRateLimit: readBoolean(summary?.abortedDueToRateLimit),
    skippedAfterRateLimit: readNumber(summary?.skippedAfterRateLimit),
    writeSummary,
    notifySent,
    itemError: readString(firstItem?.error),
    metaplexErrorKind: readString(firstItem?.metaplexErrorKind),
  };
}
