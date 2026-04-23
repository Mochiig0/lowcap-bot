import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

type ImportMintFileOutput = {
  file: string;
  count: number;
  createdCount: number;
  existingCount: number;
  items: Array<{
    mint: string;
    metadataStatus: string;
    importedAt: string;
    created: boolean;
    requestedSource: string | null;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-mint-file-test-"));

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

async function runImportMintFile(
  filePath: string,
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `import-mint-file-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `import-mint-file-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/importMintFile.ts",
          `--file ${shellEscape(filePath)}`,
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

async function readTokens(
  databaseUrl: string,
  mints: string[],
): Promise<
  Array<{
    mint: string;
    source: string | null;
    metadataStatus: string;
  }>
> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.token.findMany({
      where: {
        mint: {
          in: mints,
        },
      },
      select: {
        mint: true,
        source: true,
        metadataStatus: true,
      },
      orderBy: {
        mint: "asc",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("importMintFile boundary", async (t) => {
  await t.test("imports a valid mint-only batch file", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const filePath = join(dir, "mint-batch.json");
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            items: [
              {
                mint,
                source: "test-batch-source",
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const result = await runImportMintFile(filePath, databaseUrl);
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ImportMintFileOutput;
      assert.equal(parsed.file, filePath);
      assert.equal(parsed.count, 1);
      assert.equal(parsed.createdCount, 1);
      assert.equal(parsed.existingCount, 0);
      assert.equal(parsed.items.length, 1);
      assert.deepEqual(parsed.items[0], {
        mint,
        metadataStatus: "mint_only",
        importedAt: parsed.items[0]!.importedAt,
        created: true,
        requestedSource: "test-batch-source",
      });

      const tokens = await readTokens(databaseUrl, [mint]);
      assert.deepEqual(tokens, [
        {
          mint,
          source: "test-batch-source",
          metadataStatus: "mint_only",
        },
      ]);
    });
  });

  await t.test("exits non-zero when wrapper shape is invalid", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "invalid-wrapper.json");

      await writeFile(
        filePath,
        `${JSON.stringify({ items: {} }, null, 2)}\n`,
        "utf-8",
      );

      const result = await runImportMintFile(filePath);
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /"items" must be an array/);
      assert.match(result.stdout, /pnpm import:mint:file -- --file <PATH>/);
    });
  });

  await t.test("exits non-zero when a required mint field is missing", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "missing-mint.json");

      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            items: [
              {
                source: "test-batch-source",
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const result = await runImportMintFile(filePath);
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /items\[0\]\.mint must be a non-empty string/);
      assert.match(result.stdout, /pnpm import:mint:file -- --file <PATH>/);
    });
  });

  await t.test("keeps duplicate and rerun behavior sequential and stable", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "rerun.db")}`;
      const filePath = join(dir, "duplicate-rerun.json");
      const duplicateMint = "So11111111111111111111111111111111111111112";
      const uniqueMint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

      await runDbPush(databaseUrl);
      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            items: [
              {
                mint: duplicateMint,
                source: "test-batch-rerun",
              },
              {
                mint: duplicateMint,
                source: "test-batch-rerun",
              },
              {
                mint: uniqueMint,
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const first = await runImportMintFile(filePath, databaseUrl);
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as ImportMintFileOutput;

      assert.equal(firstParsed.count, 3);
      assert.equal(firstParsed.createdCount, 2);
      assert.equal(firstParsed.existingCount, 1);
      assert.equal(firstParsed.items[0]?.mint, duplicateMint);
      assert.equal(firstParsed.items[0]?.created, true);
      assert.equal(firstParsed.items[0]?.requestedSource, "test-batch-rerun");
      assert.equal(firstParsed.items[1]?.mint, duplicateMint);
      assert.equal(firstParsed.items[1]?.created, false);
      assert.equal(firstParsed.items[1]?.requestedSource, "test-batch-rerun");
      assert.equal(firstParsed.items[2]?.mint, uniqueMint);
      assert.equal(firstParsed.items[2]?.created, true);
      assert.equal(firstParsed.items[2]?.requestedSource, null);

      const second = await runImportMintFile(filePath, databaseUrl);
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as ImportMintFileOutput;

      assert.equal(secondParsed.count, 3);
      assert.equal(secondParsed.createdCount, 0);
      assert.equal(secondParsed.existingCount, 3);
      assert.equal(secondParsed.items.every((item) => item.created === false), true);
      assert.equal(secondParsed.items[0]?.mint, duplicateMint);
      assert.equal(secondParsed.items[1]?.mint, duplicateMint);
      assert.equal(secondParsed.items[2]?.mint, uniqueMint);

      const tokens = await readTokens(databaseUrl, [duplicateMint, uniqueMint]);
      assert.deepEqual(tokens, [
        {
          mint: uniqueMint,
          source: null,
          metadataStatus: "mint_only",
        },
        {
          mint: duplicateMint,
          source: "test-batch-rerun",
          metadataStatus: "mint_only",
        },
      ]);
    });
  });
});
