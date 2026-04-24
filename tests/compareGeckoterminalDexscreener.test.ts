import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runCompare(args: string[]): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `compare-gecko-dex-test-${process.pid}-${Date.now()}-stdout.log`,
  );
  const stderrPath = join(
    tmpdir(),
    `compare-gecko-dex-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/compareGeckoterminalDexscreener.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
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

test("compareGeckoterminalDexscreener boundary", async (t) => {
  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runCompare(["--mint"]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stderr,
      /pnpm compare:geckoterminal:dexscreener \[--timeoutSeconds <N>\] \[--intervalSeconds <N>\]/,
    );
  });

  await t.test("prints usage and exits before any live fetch on --help", async () => {
    const result = await runCompare(["--help"]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /Unknown arg:/);
    assert.match(
      result.stderr,
      /^Usage:\npnpm compare:geckoterminal:dexscreener \[--timeoutSeconds <N>\] \[--intervalSeconds <N>\]/,
    );
    assert.match(result.stderr, /dry-run and comparison only: no write, watch, checkpoint, or import handoff/);
  });
});
