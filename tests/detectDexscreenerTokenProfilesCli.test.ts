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

async function runDetectDexscreenerTokenProfiles(
  args: string[],
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `detect-dex-cli-test-${process.pid}-${Date.now()}-stdout.log`,
  );
  const stderrPath = join(
    tmpdir(),
    `detect-dex-cli-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/detectDexscreenerTokenProfiles.ts",
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

test("detectDexscreenerTokenProfiles CLI boundary", async (t) => {
  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runDetectDexscreenerTokenProfiles([
      "--mint",
      "So11111111111111111111111111111111111111112",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(
      result.stdout,
      /pnpm detect:dexscreener:token-profiles \[--file <PATH>\] \[--limit <N>\] \[--write\] \[--watch\] \[--intervalSeconds <N>\] \[--maxIterations <N>\] \[--checkpointFile <PATH>\]/,
    );
    assert.match(result.stderr, /^Error: Unknown arg: --mint$/);
  });

  await t.test("exits non-zero when watch-only timing args are used without --watch", async () => {
    const result = await runDetectDexscreenerTokenProfiles([
      "--intervalSeconds",
      "5",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(
      result.stdout,
      /- checkpointing defaults to data\/checkpoints\/dexscreener-token-profiles-latest-v1\.json and is active only with --watch --write/,
    );
    assert.match(
      result.stderr,
      /^Error: --intervalSeconds and --maxIterations require --watch$/,
    );
  });
});
