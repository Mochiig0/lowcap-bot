import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

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

type TokenEnrichOutput = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  source: string | null;
  metadataStatus: string;
  importedAt: string;
  enrichedAt: string | null;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-token-enrich-test-"));

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

async function runTokenEnrich(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `token-enrich-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `token-enrich-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokenEnrich.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
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

async function seedMintOnlyToken(databaseUrl: string, mint: string): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await db.token.create({
      data: {
        mint,
        source: "test-token-enrich-seed",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function readToken(
  databaseUrl: string,
  mint: string,
): Promise<{
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  source: string | null;
  metadataStatus: string;
  normalizedText: string | null;
  enrichedAt: Date | null;
} | null> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.token.findUnique({
      where: { mint },
      select: {
        mint: true,
        name: true,
        symbol: true,
        description: true,
        source: true,
        metadataStatus: true,
        normalizedText: true,
        enrichedAt: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("tokenEnrich boundary", async (t) => {
  await t.test("updates one token with stable top-level output fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      await seedMintOnlyToken(databaseUrl, mint);

      const result = await runTokenEnrich(
        [
          "--mint",
          mint,
          "--name",
          "Token Enrich Test",
          "--symbol",
          "TENR",
          "--desc",
          "token enrich description",
          "--source",
          "test-token-enrich",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokenEnrichOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(parsed.name, "Token Enrich Test");
      assert.equal(parsed.symbol, "TENR");
      assert.equal(parsed.description, "token enrich description");
      assert.equal(parsed.source, "test-token-enrich");
      assert.equal(parsed.metadataStatus, "enriched");
      assert.match(parsed.importedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(parsed.enrichedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.mint, mint);
      assert.equal(token?.name, "Token Enrich Test");
      assert.equal(token?.symbol, "TENR");
      assert.equal(token?.description, "token enrich description");
      assert.equal(token?.source, "test-token-enrich");
      assert.equal(token?.metadataStatus, "enriched");
      assert.match(token?.normalizedText ?? "", /token enrich test/);
      assert.notEqual(token?.enrichedAt, null);
    });
  });

  await t.test("exits non-zero when mint is missing", async () => {
    const result = await runTokenEnrich([
      "--name",
      "Token Enrich Test",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm token:enrich -- --mint <MINT> \[--name <NAME>\] \[--symbol <SYMBOL>\] \[--desc <TEXT>\] \[--source <SOURCE>\]/,
    );
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runTokenEnrich([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--file",
      "should-fail.json",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --file/);
    assert.match(
      result.stdout,
      /pnpm token:enrich -- --mint <MINT> \[--name <NAME>\] \[--symbol <SYMBOL>\] \[--desc <TEXT>\] \[--source <SOURCE>\]/,
    );
  });

  await t.test("exits non-zero when no update fields are provided", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "noop.db")}`;
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

      await runDbPush(databaseUrl);
      await seedMintOnlyToken(databaseUrl, mint);

      const result = await runTokenEnrich(["--mint", mint], databaseUrl);

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /No fields to update: provide at least one of --name, --symbol, --desc, or --source/,
      );
      assert.match(
        result.stdout,
        /pnpm token:enrich -- --mint <MINT> \[--name <NAME>\] \[--symbol <SYMBOL>\] \[--desc <TEXT>\] \[--source <SOURCE>\]/,
      );

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.name, null);
      assert.equal(token?.symbol, null);
      assert.equal(token?.description, null);
      assert.equal(token?.source, "test-token-enrich-seed");
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.normalizedText, null);
      assert.equal(token?.enrichedAt, null);
    });
  });
});
