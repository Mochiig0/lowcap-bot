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

type SourceFileOutput = {
  file: string;
  sourceEvent: {
    source: string;
    eventType: string;
    detectedAt: string;
  };
  handoffPayload: {
    mint: string;
    source?: string;
  };
  result: {
    mint: string;
    metadataStatus: string;
    importedAt: string;
    created: boolean;
  };
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-mint-source-file-test-"));

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

async function runImportMintSourceFile(
  filePath: string,
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `import-mint-source-file-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `import-mint-source-file-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/importMintSourceFile.ts",
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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function readToken(
  databaseUrl: string,
  mint: string,
): Promise<{
  mint: string;
  source: string | null;
  metadataStatus: string;
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
        source: true,
        metadataStatus: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("importMintSourceFile boundary", async (t) => {
  await t.test(
    "preserves mint-first handoff for a valid source event",
    async () => {
      await withTempDir(async (dir) => {
        const databaseUrl = `file:${join(dir, "valid.db")}`;
        const filePath = join(dir, "source-event.json");
        const mint = "So11111111111111111111111111111111111111112";

        await runDbPush(databaseUrl);
        await writeFile(
          filePath,
          `${JSON.stringify(
            {
              source: "test-source-feed",
              eventType: "token_detected",
              detectedAt: "2026-04-13T00:00:00.000Z",
              payload: {
                mintAddress: mint,
                ignoredExtraField: "kept out of handoff",
              },
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );

        const result = await runImportMintSourceFile(filePath, databaseUrl);
        assert.equal(result.ok, true);

        const parsed = JSON.parse(result.stdout) as SourceFileOutput;
        assert.equal(parsed.file, filePath);
        assert.deepEqual(parsed.sourceEvent, {
          source: "test-source-feed",
          eventType: "token_detected",
          detectedAt: "2026-04-13T00:00:00.000Z",
        });
        assert.deepEqual(parsed.handoffPayload, {
          mint,
          source: "test-source-feed",
        });
        assert.equal(parsed.result.mint, mint);
        assert.equal(parsed.result.metadataStatus, "mint_only");
        assert.equal(parsed.result.created, true);

        const token = await readToken(databaseUrl, mint);
        assert.deepEqual(token, {
          mint,
          source: "test-source-feed",
          metadataStatus: "mint_only",
        });
      });
    },
  );

  for (const invalidCase of [
    {
      name: "source",
      payload: {
        eventType: "token_detected",
        detectedAt: "2026-04-13T00:00:00.000Z",
        payload: {
          mintAddress: "So11111111111111111111111111111111111111112",
        },
      },
      expectedMessage: '"source" must be a non-empty string',
    },
    {
      name: "eventType",
      payload: {
        source: "test-source-feed",
        detectedAt: "2026-04-13T00:00:00.000Z",
        payload: {
          mintAddress: "So11111111111111111111111111111111111111112",
        },
      },
      expectedMessage: '"eventType" must be a non-empty string',
    },
    {
      name: "detectedAt",
      payload: {
        source: "test-source-feed",
        eventType: "token_detected",
        payload: {
          mintAddress: "So11111111111111111111111111111111111111112",
        },
      },
      expectedMessage: '"detectedAt" must be a non-empty string',
    },
    {
      name: "payload.mintAddress",
      payload: {
        source: "test-source-feed",
        eventType: "token_detected",
        detectedAt: "2026-04-13T00:00:00.000Z",
        payload: {},
      },
      expectedMessage: '"mintAddress" must be a non-empty string',
    },
  ] as const) {
    await t.test(`exits non-zero when ${invalidCase.name} is missing`, async () => {
      await withTempDir(async (dir) => {
        const filePath = join(dir, `${invalidCase.name.replace(".", "-")}.json`);

        await writeFile(
          filePath,
          `${JSON.stringify(invalidCase.payload, null, 2)}\n`,
          "utf-8",
        );

        const result = await runImportMintSourceFile(filePath);
        assert.equal(result.ok, false);
        assert.equal(result.code, 1);
        assert.match(
          result.stderr,
          new RegExp(
            invalidCase.expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
        );
        assert.match(result.stdout, /pnpm import:mint:source-file -- --file <PATH>/);
      });
    });
  }

  await t.test("keeps created false on sequential re-import", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "rerun.db")}`;
      const filePath = join(dir, "source-event-rerun.json");
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            source: "test-source-feed-rerun",
            eventType: "token_detected",
            detectedAt: "2026-04-14T00:00:00.000Z",
            payload: {
              mintAddress: mint,
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const first = await runImportMintSourceFile(filePath, databaseUrl);
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as SourceFileOutput;
      assert.equal(firstParsed.result.created, true);

      const second = await runImportMintSourceFile(filePath, databaseUrl);
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as SourceFileOutput;

      assert.deepEqual(secondParsed.handoffPayload, {
        mint,
        source: "test-source-feed-rerun",
      });
      assert.equal(secondParsed.result.mint, mint);
      assert.equal(secondParsed.result.metadataStatus, "mint_only");
      assert.equal(secondParsed.result.created, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        source: "test-source-feed-rerun",
        metadataStatus: "mint_only",
      });
    });
  });
});
