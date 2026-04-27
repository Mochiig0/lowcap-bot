import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
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

type JsonObject = Record<string, unknown>;

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runDetectGeckoterminalNewPools(
  args: string[],
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `detect-gecko-cli-test-${process.pid}-${Date.now()}-stdout.log`,
  );
  const stderrPath = join(
    tmpdir(),
    `detect-gecko-cli-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/detectGeckoterminalNewPools.ts",
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

test("detectGeckoterminalNewPools CLI boundary", async (t) => {
  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runDetectGeckoterminalNewPools([
      "--mint",
      "So11111111111111111111111111111111111111112",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(
      result.stdout,
      /pnpm detect:geckoterminal:new-pools \[--file <PATH>\] \[--pumpOnly\] \[--limit <N>\] \[--write\] \[--watch\] \[--intervalSeconds <N>\] \[--maxIterations <N>\] \[--checkpointFile <PATH>\]/,
    );
    assert.match(result.stderr, /^Error: Unknown arg: --mint$/);
  });

  await t.test("exits non-zero when limit is not positive", async () => {
    const result = await runDetectGeckoterminalNewPools(["--limit", "0"]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(result.stderr, /^Error: Invalid integer for --limit: 0$/);
  });

  await t.test("requires a one item limit for pump-only writes", async () => {
    const result = await runDetectGeckoterminalNewPools([
      "--pumpOnly",
      "--write",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(result.stderr, /^Error: --write --pumpOnly requires --limit 1$/);
  });

  await t.test("keeps pump-only writes one-shot only", async () => {
    const result = await runDetectGeckoterminalNewPools([
      "--pumpOnly",
      "--limit",
      "1",
      "--write",
      "--watch",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(
      result.stderr,
      /^Error: --write --pumpOnly is supported only in one-shot mode$/,
    );
  });

  await t.test("exits non-zero when watch-only timing args are used without --watch", async () => {
    const result = await runDetectGeckoterminalNewPools([
      "--intervalSeconds",
      "5",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(
      result.stdout,
      /- checkpointing defaults to data\/checkpoints\/geckoterminal-new-pools\.json and is active only with --watch --write/,
    );
    assert.match(
      result.stderr,
      /^Error: --intervalSeconds and --maxIterations require --watch$/,
    );
  });

  await t.test("one-shot scans the page and selects one pump candidate", async () => {
    const nonPumpRaw = JSON.parse(
      await readFile(
        "fixtures/source-events/geckoterminal-new-pools.solana-777-usdc-orca-first-item.json",
        "utf-8",
      ),
    ) as JsonObject;
    const pumpRaw = JSON.parse(
      await readFile(
        "fixtures/source-events/geckoterminal-new-pools.solana-wtf-first-item.json",
        "utf-8",
      ),
    ) as JsonObject;
    const filePath = join(
      tmpdir(),
      `detect-gecko-cli-test-${process.pid}-${Date.now()}-mixed-page.json`,
    );

    try {
      await writeFile(
        filePath,
        JSON.stringify(
          {
            data: [
              ...(Array.isArray(nonPumpRaw.data) ? nonPumpRaw.data : []),
              ...(Array.isArray(pumpRaw.data) ? pumpRaw.data : []),
            ],
            included: [
              ...(Array.isArray(nonPumpRaw.included) ? nonPumpRaw.included : []),
              ...(Array.isArray(pumpRaw.included) ? pumpRaw.included : []),
            ],
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runDetectGeckoterminalNewPools([
        "--file",
        filePath,
        "--pumpOnly",
        "--limit",
        "1",
      ]);

      assert.equal(result.ok, true);
      if (!result.ok) return;

      const parsed = JSON.parse(result.stdout) as {
        dryRun: boolean;
        writeEnabled: boolean;
        inputCount: number;
        processedCount: number;
        selectedCount: number;
        skippedNonPumpCount: number;
        importedCount: number;
        selection: {
          pumpOnly: boolean;
          limit: number | null;
          selectedCount: number;
          skippedNonPumpCount: number;
        };
        items: Array<{
          mintAddress: string;
          importResult?: unknown;
        }>;
      };

      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.inputCount, 2);
      assert.equal(parsed.processedCount, 1);
      assert.equal(parsed.selectedCount, 1);
      assert.equal(parsed.skippedNonPumpCount, 1);
      assert.equal(parsed.importedCount, 0);
      assert.equal(parsed.selection.pumpOnly, true);
      assert.equal(parsed.selection.limit, 1);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.selection.skippedNonPumpCount, 1);
      assert.equal(parsed.items.length, 1);
      assert.equal(
        parsed.items[0]?.mintAddress,
        "2RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump",
      );
      assert.equal("importResult" in (parsed.items[0] ?? {}), false);
    } finally {
      await rm(filePath, { force: true });
    }
  });
});
