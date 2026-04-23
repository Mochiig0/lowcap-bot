import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
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

async function pushTokenTable(databaseUrl: string): Promise<void> {
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

async function runCheckPrismaTokenTable(
  databaseUrl: string,
  runnerName: string,
  timeoutMs = "0",
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["./scripts/check-prisma-token-table.mjs", runnerName, timeoutMs],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
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

test("check-prisma-token-table boundary", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "lowcap-check-prisma-"));

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test("exits 0 when the Token table exists", async () => {
    const databaseUrl = `file:${join(tempDir, "success.db")}`;
    await pushTokenTable(databaseUrl);

    const result = await runCheckPrismaTokenTable(
      databaseUrl,
      "token-table-success",
    );

    assert.equal(result.ok, true);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });

  await t.test("exits non-zero with a stable preflight error when the Token table is missing", async () => {
    const databaseUrl = `file:${join(tempDir, "missing-token-table.db")}`;

    const result = await runCheckPrismaTokenTable(
      databaseUrl,
      "token-table-missing",
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /prisma:error/);
    assert.match(result.stderr, /^\[token-table-missing\] db_preflight_failed=/m);
    assert.match(result.stderr, /timeout_ms=0/);
    assert.match(result.stderr, /retry_delay_ms=250/);
    assert.match(result.stderr, /The table `main\.Token` does not exist in the current database\./);
    assert.match(
      result.stderr,
      /hint="Run DATABASE_URL=\.\.\. pnpm exec prisma db push --skip-generate before starting the runner\."/,
    );
  });
});
