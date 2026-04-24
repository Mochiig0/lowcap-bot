import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GECKO_FIXTURE_PATH =
  "fixtures/source-events/geckoterminal-new-pools.solana-wtf-first-item.json";
const GECKO_MINT = "2RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump";
const ONLY_DEX_MINT = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

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

type CompareCoverageOutput = {
  readOnly: true;
  selection: {
    geckoMode: "fetch" | "file";
    dexMode: "poll" | "file";
    dexPollCount: number;
  };
  geckoCount: number;
  dexCount: number;
  overlapCount: number;
  onlyGeckoCount: number;
  onlyDexCount: number;
  overlapMints: string[];
  onlyGeckoMints: string[];
  onlyDexMints: string[];
  representativeSamples: {
    overlap: Array<{
      mint: string;
    }>;
    onlyGecko: Array<{
      mint: string;
    }>;
    onlyDex: Array<{
      mint: string;
    }>;
  };
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-compare-coverage-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runCompareCoverage(
  args: string[],
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `compare-coverage-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `compare-coverage-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/compareCoverageGeckoterminalDexscreener.ts",
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

test("compareCoverageGeckoterminalDexscreener boundary", async (t) => {
  await t.test("supports deterministic file-based overlap compare", async () => {
    await withTempDir(async (dir) => {
      const dexFile = join(dir, "dex.json");

      await writeFile(
        dexFile,
        JSON.stringify(
          [
            {
              chainId: "solana",
              tokenAddress: GECKO_MINT,
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
            {
              chainId: "solana",
              tokenAddress: ONLY_DEX_MINT,
              updatedAt: "2026-04-20T00:00:00.000Z",
            },
          ],
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runCompareCoverage([
        "--geckoFile",
        GECKO_FIXTURE_PATH,
        "--dexFile",
        dexFile,
      ]);

      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const parsed = JSON.parse(result.stdout) as CompareCoverageOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.selection.geckoMode, "file");
      assert.equal(parsed.selection.dexMode, "file");
      assert.equal(parsed.selection.dexPollCount, 1);
      assert.equal(parsed.geckoCount, 1);
      assert.equal(parsed.dexCount, 2);
      assert.equal(parsed.overlapCount, 1);
      assert.equal(parsed.onlyGeckoCount, 0);
      assert.equal(parsed.onlyDexCount, 1);
      assert.deepEqual(parsed.overlapMints, [GECKO_MINT]);
      assert.deepEqual(parsed.onlyGeckoMints, []);
      assert.deepEqual(parsed.onlyDexMints, [ONLY_DEX_MINT]);
      assert.equal(parsed.representativeSamples.overlap[0]?.mint, GECKO_MINT);
      assert.equal(parsed.representativeSamples.onlyGecko.length, 0);
      assert.equal(parsed.representativeSamples.onlyDex[0]?.mint, ONLY_DEX_MINT);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runCompareCoverage([
      "--mint",
      GECKO_MINT,
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stderr,
      /pnpm compare:coverage:geckoterminal:dexscreener \[--geckoFile <PATH>\] \[--dexFile <PATH>\]/,
    );
  });

  await t.test("keeps success semantics when the dex file is empty", async () => {
    await withTempDir(async (dir) => {
      const dexFile = join(dir, "dex-empty.json");

      await writeFile(dexFile, "[]\n", "utf-8");

      const result = await runCompareCoverage([
        "--geckoFile",
        GECKO_FIXTURE_PATH,
        "--dexFile",
        dexFile,
      ]);

      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const parsed = JSON.parse(result.stdout) as CompareCoverageOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.geckoCount, 1);
      assert.equal(parsed.dexCount, 0);
      assert.equal(parsed.overlapCount, 0);
      assert.equal(parsed.onlyGeckoCount, 1);
      assert.equal(parsed.onlyDexCount, 0);
      assert.deepEqual(parsed.overlapMints, []);
      assert.deepEqual(parsed.onlyGeckoMints, [GECKO_MINT]);
      assert.deepEqual(parsed.onlyDexMints, []);
      assert.equal(parsed.representativeSamples.overlap.length, 0);
      assert.equal(parsed.representativeSamples.onlyGecko[0]?.mint, GECKO_MINT);
      assert.equal(parsed.representativeSamples.onlyDex.length, 0);
    });
  });
});
