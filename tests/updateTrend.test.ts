import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { parseKeywordsArg } from "../src/cli/updateTrend.ts";

const execFileAsync = promisify(execFile);

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-update-trend-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

test("parseKeywordsArg splits a comma-separated string into keywords", () => {
  assert.deepEqual(parseKeywordsArg("ai,anime,base"), ["ai", "anime", "base"]);
});

test("parseKeywordsArg trims whitespace and removes empty items", () => {
  assert.deepEqual(
    parseKeywordsArg(" ai,  anime ,, base  , "),
    ["ai", "anime", "base"],
  );
});

test("parseKeywordsArg keeps current dedupe and sort behavior", () => {
  assert.deepEqual(
    parseKeywordsArg("base,AI, anime, ai,base"),
    ["ai", "anime", "base"],
  );
});

test("trend:update reads and writes data/trend.json from the current working directory", async () => {
  await withTempDir(async (dir) => {
    const dataDir = join(dir, "data");
    const trendPath = join(dataDir, "trend.json");
    const updateTrendPath = join(process.cwd(), "src/cli/updateTrend.ts");
    const tsxLoaderPath = join(process.cwd(), "node_modules/tsx/dist/loader.mjs");
    const stdoutPath = join(dir, "update-trend.stdout.json");
    const stderrPath = join(dir, "update-trend.stderr.log");

    await mkdir(dataDir);
    await writeFile(
      trendPath,
      `${JSON.stringify(
        {
          generatedAt: "2026-01-01T00:00:00.000Z",
          ttlHours: 24,
          keywords: [
            {
              keyword: "ai",
              score: 7,
              tag: "existing",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node",
          "--import",
          shellEscape(tsxLoaderPath),
          shellEscape(updateTrendPath),
          "--",
          "--keywords",
          shellEscape("solchat,AI"),
          "--ttlHours",
          "12",
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: dir,
      },
    );

    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8"),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    assert.equal(stderr, "");

    const parsedStdout = JSON.parse(stdout) as {
      path?: string;
      generatedAt?: string;
      ttlHours?: number;
      keywordCount?: number;
      keywords?: string[];
    };

    assert.equal(parsedStdout.path, "data/trend.json");
    assert.equal(parsedStdout.ttlHours, 12);
    assert.equal(parsedStdout.keywordCount, 2);
    assert.deepEqual(parsedStdout.keywords, ["ai", "solchat"]);
    assert.equal(Number.isNaN(Date.parse(parsedStdout.generatedAt ?? "")), false);

    const updated = JSON.parse(await readFile(trendPath, "utf-8")) as {
      generatedAt?: string;
      ttlHours?: number;
      keywords?: Array<{
        keyword?: string;
        score?: number;
        tag?: string;
      }>;
    };

    assert.equal(updated.ttlHours, 12);
    assert.equal(Number.isNaN(Date.parse(updated.generatedAt ?? "")), false);
    assert.deepEqual(
      updated.keywords?.map((entry) => entry.keyword),
      ["ai", "solchat"],
    );
    assert.deepEqual(updated.keywords?.[0], {
      keyword: "ai",
      score: 7,
      tag: "existing",
    });
    assert.deepEqual(updated.keywords?.[1], {
      keyword: "solchat",
      score: 1,
      tag: "trend",
    });
  });
});
