import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

type MetaplexLogsSummaryOutput = {
  totalCycles: number;
  totalMetaplexAttemptedCount: number;
  totalMetaplexAvailableCount: number;
  totalMetaplexSavedCount: number;
  metaplexErrorKindTotals: Record<string, number>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-metaplex-log-summary-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runGeckoterminalMetaplexLogsSummary(args: string[]): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-metaplex-log-summary-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-metaplex-log-summary-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node ./scripts/summarize-geckoterminal-enrich-metaplex-log.mjs",
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
      readFile(stdoutPath, "utf-8").catch(() => ""),
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

test("geckoterminalMetaplexLogsSummary boundary", async (t) => {
  await t.test("returns a metaplex log summary with stable top-level fields", async () => {
    await withTempDir(async (dir) => {
      const logPath = join(dir, "enrich-fast.log");

      await writeFile(
        logPath,
        [
          "plain log line that should be ignored",
          "[token:enrich-rescore:geckoterminal] selected=2 metaplexAttemptedCount=2 metaplexAvailableCount=1 metaplexSavedCount=1 metaplexErrorKindCounts={\"metadata_account_missing\":1}",
          "[token:enrich-rescore:geckoterminal] selected=1 metaplexAttemptedCount=3 metaplexAvailableCount=2 metaplexSavedCount=0 metaplexErrorKindCounts={\"metadata_account_missing\":2,\"rpc_missing_account_data\":1}",
        ].join("\n"),
        "utf8",
      );

      const result = await runGeckoterminalMetaplexLogsSummary([logPath]);
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetaplexLogsSummaryOutput;
      assert.equal(parsed.totalCycles, 2);
      assert.equal(parsed.totalMetaplexAttemptedCount, 5);
      assert.equal(parsed.totalMetaplexAvailableCount, 3);
      assert.equal(parsed.totalMetaplexSavedCount, 1);
      assert.deepEqual(parsed.metaplexErrorKindTotals, {
        metadata_account_missing: 3,
        rpc_missing_account_data: 1,
      });
    });
  });

  await t.test("exits non-zero when the required log path is missing", async () => {
    const result = await runGeckoterminalMetaplexLogsSummary([]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /Usage: node \.\/scripts\/summarize-geckoterminal-enrich-metaplex-log\.mjs <enrich-fast-log-path>/,
    );
  });

  await t.test("returns zero totals when the log contains no summary lines", async () => {
    await withTempDir(async (dir) => {
      const logPath = join(dir, "empty.log");

      await writeFile(
        logPath,
        [
          "plain log line",
          "another non-summary line",
        ].join("\n"),
        "utf8",
      );

      const result = await runGeckoterminalMetaplexLogsSummary([logPath]);
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetaplexLogsSummaryOutput;
      assert.equal(parsed.totalCycles, 0);
      assert.equal(parsed.totalMetaplexAttemptedCount, 0);
      assert.equal(parsed.totalMetaplexAvailableCount, 0);
      assert.equal(parsed.totalMetaplexSavedCount, 0);
      assert.deepEqual(parsed.metaplexErrorKindTotals, {});
    });
  });
});
