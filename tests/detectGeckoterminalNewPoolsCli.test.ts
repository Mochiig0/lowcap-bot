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

type JsonObject = Record<string, unknown>;

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-detect-gecko-cli-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
  await execFileAsync(
    "bash",
    ["-lc", "pnpm exec prisma db push --skip-generate"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runDetectGeckoterminalNewPools(
  args: string[],
  envOverrides: Record<string, string | undefined> = {},
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
        env: {
          ...process.env,
          ...envOverrides,
        },
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

  await t.test("rejects checkpoint files outside write-enabled watch mode", async () => {
    const result = await runDetectGeckoterminalNewPools([
      "--checkpointFile",
      "/tmp/lowcap-detect-gecko-test-checkpoint.json",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^Usage:/);
    assert.match(
      result.stderr,
      /^Error: --checkpointFile requires both --watch and --write$/,
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

  await t.test("allows bounded pump-only watch writes without advancing past the selected checkpoint", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "bounded-pump-watch.db")}`;
      await runDbPush(databaseUrl);

      const raw = JSON.parse(
        await readFile(
          "fixtures/source-events/geckoterminal-new-pools.solana-wtf-first-item.json",
          "utf-8",
        ),
      ) as JsonObject;
      const firstPool = Array.isArray(raw.data) ? (raw.data[0] as JsonObject) : undefined;
      assert.ok(firstPool);
      const secondPool = JSON.parse(JSON.stringify(firstPool)) as JsonObject;
      const secondMint = "3RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump";
      const secondPoolAddress = "DXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc";

      secondPool.id = `solana_${secondPoolAddress}`;
      secondPool.attributes = {
        ...((secondPool.attributes as JsonObject | undefined) ?? {}),
        address: secondPoolAddress,
        name: "WTF2 / SOL",
        pool_created_at: "2026-04-18T02:14:55Z",
      };
      secondPool.relationships = {
        ...((secondPool.relationships as JsonObject | undefined) ?? {}),
        base_token: {
          data: {
            id: `solana_${secondMint}`,
            type: "token",
          },
        },
      };

      const filePath = join(dir, "two-pump-candidates.json");
      const checkpointPath = join(dir, "checkpoint.json");

      await writeFile(
        filePath,
        JSON.stringify(
          {
            data: [
              ...(Array.isArray(raw.data) ? raw.data : []),
              secondPool,
            ],
            included: [
              ...(Array.isArray(raw.included) ? raw.included : []),
              {
                id: `solana_${secondMint}`,
                type: "token",
                attributes: {
                  address: secondMint,
                  name: "WTF Are Agents Buying Too?",
                  symbol: "WTF2",
                  decimals: 6,
                },
              },
            ],
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runDetectGeckoterminalNewPools(
        [
          "--file",
          filePath,
          "--pumpOnly",
          "--limit",
          "1",
          "--write",
          "--watch",
          "--maxIterations",
          "1",
          "--checkpointFile",
          checkpointPath,
        ],
        { DATABASE_URL: databaseUrl },
      );

      assert.equal(result.ok, true);
      if (!result.ok) return;

      const parsed = JSON.parse(result.stdout) as {
        dryRun: boolean;
        writeEnabled: boolean;
        watchEnabled: boolean;
        checkpointEnabled: boolean;
        checkpointUpdated: boolean;
        inputCount: number;
        processedCount: number;
        selectedCount: number;
        acceptedCount: number;
        importedCount: number;
        existingCount: number;
        cycleCount: number;
        selection: {
          pumpOnly: boolean;
          limit: number | null;
          skippedNonPumpCount: number;
        };
        checkpointAfter?: {
          poolCreatedAt: string;
          poolAddress: string;
        };
        items: Array<{
          mintAddress: string;
          importResult?: {
            created: boolean;
          };
        }>;
      };

      assert.equal(parsed.dryRun, false);
      assert.equal(parsed.writeEnabled, true);
      assert.equal(parsed.watchEnabled, true);
      assert.equal(parsed.checkpointEnabled, true);
      assert.equal(parsed.checkpointUpdated, true);
      assert.equal(parsed.inputCount, 2);
      assert.equal(parsed.processedCount, 1);
      assert.equal(parsed.selectedCount, 1);
      assert.equal(parsed.acceptedCount, 1);
      assert.equal(parsed.importedCount, 1);
      assert.equal(parsed.existingCount, 0);
      assert.equal(parsed.cycleCount, 1);
      assert.equal(parsed.selection.pumpOnly, true);
      assert.equal(parsed.selection.limit, 1);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.equal(parsed.items.length, 1);
      assert.equal(
        parsed.items[0]?.mintAddress,
        "2RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump",
      );
      assert.equal(parsed.items[0]?.importResult?.created, true);
      assert.deepEqual(parsed.checkpointAfter, {
        poolCreatedAt: "2026-04-18T02:13:55.000Z",
        poolAddress: "CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc",
      });

      const checkpoint = JSON.parse(await readFile(checkpointPath, "utf-8")) as {
        cursor?: {
          poolCreatedAt?: string;
          poolAddress?: string;
        };
      };
      assert.deepEqual(checkpoint.cursor, {
        poolCreatedAt: "2026-04-18T02:13:55.000Z",
        poolAddress: "CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc",
      });
      assert.notEqual(checkpoint.cursor?.poolAddress, secondPoolAddress);
    });
  });
});
