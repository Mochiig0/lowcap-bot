import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

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

type ObservedProcess = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
};

async function writeStubExecutable(
  dir: string,
  name: string,
  content: string,
): Promise<void> {
  const stubPath = join(dir, name);
  await writeFile(stubPath, content, "utf-8");
  await chmod(stubPath, 0o755);
}

async function runEnrichRescoreNotifyFailure(
  envOverrides: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "/bin/bash",
      ["scripts/run-geckoterminal-enrich-rescore-notify.sh", "--pumpOnly"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...envOverrides,
        },
      },
    );

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const output = error as {
      stdout?: string;
      stderr?: string;
      code?: number | null;
    };

    return {
      ok: false,
      stdout: (output.stdout ?? "").trim(),
      stderr: (output.stderr ?? "").trim(),
      code: output.code ?? null,
    };
  }
}

async function runEnrichRescoreNotifyUntilFirstCycle(
  envOverrides: NodeJS.ProcessEnv,
): Promise<ObservedProcess> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      "/bin/bash",
      ["scripts/run-geckoterminal-enrich-rescore-notify.sh", "--pumpOnly"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...envOverrides,
        },
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    let stopRequested = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("timed out waiting for the first enrich-rescore-notify cycle"));
    }, 5000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (!stopRequested && /\[geckoterminal-enrich-rescore-notify\] cycle_ok=/.test(stderr)) {
        stopRequested = true;
        child.kill("SIGTERM");
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code,
        signal,
      });
    });
  });
}

test("run-geckoterminal-enrich-rescore-notify wrapper boundary", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "lowcap-gecko-enrich-runner-"));

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test("runs the node preflight and emits one cycle with the expected wrapper args", async () => {
    await writeStubExecutable(
      tempDir,
      "node",
      `#!/usr/bin/env bash
if [[ "$1" == "./scripts/check-prisma-token-table.mjs" ]]; then
  echo "nodeArg0=$1"
  echo "nodeArg1=$2"
  exit 0
fi

if [[ "$1" == "--import" ]]; then
  shift
  for arg in "$@"; do
    echo "mainArg=$arg" >&2
  done
  printf '{"summary":{"rateLimited":false},"mode":"batch"}\n'
  exit 0
fi

if [[ "$1" == "--input-type=module" ]]; then
  printf 'false'
  exit 0
fi

echo "unexpected_node_call=$*" >&2
exit 1
`,
    );

    const observed = await runEnrichRescoreNotifyUntilFirstCycle({
      PATH: `${tempDir}:/usr/bin:/bin`,
      DATABASE_URL: "file:/tmp/gecko-enrich-wrapper.db",
      LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS: "3600",
      LOWCAP_GECKOTERMINAL_ENRICH_LIMIT: "7",
      LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES: "33",
      LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS: "0",
      LOWCAP_GECKOTERMINAL_ENRICH_FAILURE_COOLDOWN_SECONDS: "0",
      LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON: "1",
    });

    assert.equal(observed.signal, "SIGTERM");
    assert.match(observed.stdout, /^nodeArg0=\.\/scripts\/check-prisma-token-table\.mjs$/m);
    assert.match(observed.stdout, /^nodeArg1=geckoterminal-enrich-rescore-notify$/m);
    assert.match(observed.stdout, /"mode":"batch"/);
    assert.match(observed.stdout, /"rateLimited":false/);
    assert.match(
      observed.stderr,
      /\[geckoterminal-enrich-rescore-notify\] cycle_start=.*limit=7 sinceMinutes=33/,
    );
    assert.match(observed.stderr, /^mainArg=tsx$/m);
    assert.match(
      observed.stderr,
      /^mainArg=src\/cli\/tokenEnrichRescoreGeckoterminal\.ts$/m,
    );
    assert.match(observed.stderr, /^mainArg=--write$/m);
    assert.match(observed.stderr, /^mainArg=--notify$/m);
    assert.match(observed.stderr, /^mainArg=--limit$/m);
    assert.match(observed.stderr, /^mainArg=7$/m);
    assert.match(observed.stderr, /^mainArg=--sinceMinutes$/m);
    assert.match(observed.stderr, /^mainArg=33$/m);
    assert.match(observed.stderr, /^mainArg=--pumpOnly$/m);
    assert.match(observed.stderr, /\[geckoterminal-enrich-rescore-notify\] cycle_ok=/);
  });

  await t.test("exits non-zero when the node preflight fails", async () => {
    await writeStubExecutable(
      tempDir,
      "node",
      `#!/usr/bin/env bash
if [[ "$1" == "./scripts/check-prisma-token-table.mjs" ]]; then
  echo "stub_preflight_failed=$2" >&2
  exit 1
fi
exit 0
`,
    );

    const result = await runEnrichRescoreNotifyFailure({
      PATH: `${tempDir}:/usr/bin:/bin`,
      DATABASE_URL: "file:/tmp/gecko-enrich-wrapper.db",
      LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS: "0",
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /stub_preflight_failed=geckoterminal-enrich-rescore-notify/);
  });
});
