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

async function runGeckoterminalMetricWatch(
  envOverrides: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "/bin/bash",
      ["scripts/run-geckoterminal-metric-watch.sh", "--maxIterations", "1"],
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

test("run-geckoterminal-metric-watch wrapper boundary", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "lowcap-gecko-metric-watch-"));

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test("runs the node preflight and execs the expected pnpm metric command", async () => {
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

    const result = await runGeckoterminalMetricWatch({
      PATH: `${tempDir}:/usr/bin:/bin`,
      DATABASE_URL: "file:/tmp/gecko-metric-wrapper.db",
      LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS: "41",
      LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES: "13",
      LOWCAP_GECKOTERMINAL_METRIC_LIMIT: "7",
      LOWCAP_GECKOTERMINAL_METRIC_SINCE_MINUTES: "180",
      LOWCAP_GECKOTERMINAL_METRIC_SOURCE: "geckoterminal.token_snapshot_with_top_pools",
      LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS: "0",
    });

    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^nodeArg0=\.\/scripts\/check-prisma-token-table\.mjs$/m);
    assert.match(result.stdout, /^nodeArg1=geckoterminal-metric-watch$/m);
    assert.match(
      result.stdout,
      new RegExp(`^cwd=${process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
    );
    assert.match(result.stdout, /^databaseUrl=file:\/tmp\/gecko-metric-wrapper\.db$/m);
    assert.match(result.stdout, /^arg=metric:snapshot:geckoterminal$/m);
    assert.match(result.stdout, /^arg=--$/m);
    assert.match(result.stdout, /^arg=--watch$/m);
    assert.match(result.stdout, /^arg=--write$/m);
    assert.match(result.stdout, /^arg=--intervalSeconds$/m);
    assert.match(result.stdout, /^arg=41$/m);
    assert.match(result.stdout, /^arg=--minGapMinutes$/m);
    assert.match(result.stdout, /^arg=13$/m);
    assert.match(result.stdout, /^arg=--limit$/m);
    assert.match(result.stdout, /^arg=7$/m);
    assert.match(result.stdout, /^arg=--sinceMinutes$/m);
    assert.match(result.stdout, /^arg=180$/m);
    assert.match(result.stdout, /^arg=--source$/m);
    assert.match(result.stdout, /^arg=geckoterminal\.token_snapshot_with_top_pools$/m);
    assert.match(result.stdout, /^arg=--maxIterations$/m);
    assert.match(result.stdout, /^arg=1$/m);
  });

  await t.test("exits non-zero when pnpm is missing from PATH", async () => {
    const result = await runGeckoterminalMetricWatch({
      PATH: "/usr/bin:/bin",
      DATABASE_URL: "file:/tmp/gecko-metric-wrapper.db",
      LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS: "0",
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /Error: pnpm is required to run the GeckoTerminal metric watch runner\./,
    );
  });
});
