import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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

async function writeStubExecutable(
  dir: string,
  name: string,
  content: string,
): Promise<void> {
  const stubPath = join(dir, name);
  await writeFile(stubPath, content, "utf-8");
  await chmod(stubPath, 0o755);
}

async function runGeckoterminalWatch(
  envOverrides: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "/bin/bash",
      ["scripts/run-geckoterminal-detect-watch.sh", "--maxIterations", "1"],
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

test("run-geckoterminal-detect-watch wrapper boundary", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "lowcap-gecko-detect-watch-"));

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test("runs the node preflight and execs the expected pnpm detect command", async () => {
    await writeStubExecutable(
      tempDir,
      "node",
      `#!/usr/bin/env bash
echo "nodeArg0=$1"
echo "nodeArg1=$2"
exit 0
`,
    );
    await writeStubExecutable(
      tempDir,
      "pnpm",
      `#!/usr/bin/env bash
echo "cwd=$PWD"
echo "databaseUrl=\${DATABASE_URL:-}"
for arg in "$@"; do
  echo "arg=$arg"
done
`,
    );

    const checkpointFile = join(tempDir, "gecko-detect-checkpoint.json");
    const result = await runGeckoterminalWatch({
      PATH: `${tempDir}:/usr/bin:/bin`,
      DATABASE_URL: "file:/tmp/gecko-detect-wrapper.db",
      LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE: checkpointFile,
      LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS: "31",
    });

    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^nodeArg0=\.\/scripts\/check-prisma-token-table\.mjs$/m);
    assert.match(result.stdout, /^nodeArg1=geckoterminal-detect-watch$/m);
    assert.match(
      result.stdout,
      new RegExp(`^cwd=${process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
    );
    assert.match(result.stdout, /^databaseUrl=file:\/tmp\/gecko-detect-wrapper\.db$/m);
    assert.match(result.stdout, /^arg=detect:geckoterminal:new-pools$/m);
    assert.match(result.stdout, /^arg=--$/m);
    assert.match(result.stdout, /^arg=--watch$/m);
    assert.match(result.stdout, /^arg=--write$/m);
    assert.match(result.stdout, /^arg=--intervalSeconds$/m);
    assert.match(result.stdout, /^arg=31$/m);
    assert.match(result.stdout, /^arg=--checkpointFile$/m);
    assert.match(
      result.stdout,
      new RegExp(`^arg=${checkpointFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
    );
    assert.match(result.stdout, /^arg=--maxIterations$/m);
    assert.match(result.stdout, /^arg=1$/m);
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
    await writeStubExecutable(
      tempDir,
      "pnpm",
      `#!/usr/bin/env bash
echo "pnpm_should_not_run" >&2
exit 0
`,
    );

    const result = await runGeckoterminalWatch({
      PATH: `${tempDir}:/usr/bin:/bin`,
      DATABASE_URL: "file:/tmp/gecko-detect-wrapper.db",
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /stub_preflight_failed=geckoterminal-detect-watch/);
  });

  await t.test("exits non-zero when pnpm is missing from PATH", async () => {
    const result = await runGeckoterminalWatch({
      PATH: "/usr/bin:/bin",
      DATABASE_URL: "file:/tmp/gecko-detect-wrapper.db",
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /Error: pnpm is required to run the GeckoTerminal detect watch runner\./,
    );
  });
});
