import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

async function runIndexHelpHub(args: string[]): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-index-help-hub-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          'node --import tsx src/index.ts "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE"',
          "bash",
          ...args,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            STDOUT_FILE: stdoutPath,
            STDERR_FILE: stderrPath,
          },
        },
      );

      return {
        ok: true,
        stdout: (await readFile(stdoutPath, "utf-8")).trim(),
        stderr: (await readFile(stderrPath, "utf-8")).trim(),
      };
    } catch (error) {
      const output = error as {
        code?: number | null;
      };

      return {
        ok: false,
        stdout: (await readFile(stdoutPath, "utf-8").catch(() => "")).trim(),
        stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
        code: output.code ?? null,
      };
    }
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

test("index help hub boundary", async (t) => {
  await t.test("prints the CLI help hub on no-arg execution", async () => {
    const result = await runIndexHelpHub([]);

    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Lowcap Bot CLI Hub/);
    assert.match(result.stdout, /Available commands:/);
    assert.match(result.stdout, /pnpm import:mint -- --mint <MINT> \[--source <SOURCE>\]/);
    assert.match(
      result.stdout,
      /pnpm detect:geckoterminal:new-pools \[--file <PATH>\] \[--write\] \[--watch\]/,
    );
    assert.match(
      result.stdout,
      /pnpm context:compare:source-families -- \[--sinceHours <N>\] \[--limit <N>\]/,
    );
    assert.match(
      result.stdout,
      /pnpm review:queue:geckoterminal -- \[--sinceHours <N>\] \[--limit <N>\] \[--pumpOnly\]/,
    );
    assert.match(
      result.stdout,
      /pnpm metric:snapshot:geckoterminal -- \[--mint <MINT>\]/,
    );
    assert.match(
      result.stdout,
      /pnpm tokens:report -- \[--rank <RANK>\] \[--source <SOURCE>\]/,
    );
    assert.match(result.stdout, /pnpm smoke/);
  });

  await t.test("keeps the same help behavior when unknown args are passed", async () => {
    const result = await runIndexHelpHub(["--unknown"]);

    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Lowcap Bot CLI Hub/);
    assert.match(result.stdout, /Available commands:/);
    assert.match(
      result.stdout,
      /pnpm token:enrich-rescore:geckoterminal -- \[--mint <MINT>\] \[--limit <N>\]/,
    );
    assert.match(
      result.stdout,
      /pnpm review:manual-targets:geckoterminal -- \[--sinceHours <N>\] \[--limit <N>\] \[--pumpOnly\]/,
    );
    assert.doesNotMatch(result.stdout, /Unknown arg:/);
  });
});
