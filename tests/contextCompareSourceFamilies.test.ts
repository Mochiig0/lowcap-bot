import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

const GECKO_ORIGIN_SOURCE = "geckoterminal.new_pools";

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

type ContextCompareSourceFamiliesOutput = {
  readOnly: true;
  selection: {
    sinceHours: number;
    limit: number;
    sinceCutoff: string;
    geckoOriginTokenCount: number;
    skippedNonPumpCount: number;
    selectedCount: number;
  };
  comparedSources: Array<{
    id: string;
    family: string;
    label: string;
    endpoint: string;
    mode: "perMint" | "sharedBatch";
  }>;
  availabilitySummary: Array<{
    sourceId: string;
    family: string;
    totalChecked: number;
    okCount: number;
    notFoundCount: number;
    fetchErrorCount: number;
    rateLimitedCount: number;
    errorCategoryCounts: Record<string, number>;
    errorCodeCounts: Record<string, number>;
    descriptionAvailableCount: number;
    websiteAvailableCount: number;
    xAvailableCount: number;
    telegramAvailableCount: number;
    anyLinksAvailableCount: number;
  }>;
  metaplexDeepDive: {
    sourceId: "metaplex.metadata_uri";
    fetchErrorBreakdown: Record<string, number>;
    notFoundReasonSummary: Record<string, number>;
    okSummary: {
      okWithOffchainCount: number;
      okWithoutOffchainCount: number;
      descriptionAvailableCount: number;
      websiteAvailableCount: number;
      xAvailableCount: number;
      telegramAvailableCount: number;
      anyLinksAvailableCount: number;
    };
    sampleDetails: Array<{
      mint: string;
      status: "ok" | "not_found" | "error";
      detail: Record<string, unknown> | null;
      metadata: {
        description: string | null;
      } | null;
      links: {
        website: string | null;
        x: string | null;
        telegram: string | null;
        anyLinks: boolean;
      } | null;
    }>;
  };
  sampleResults: Array<{
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    sourceResults: Array<{
      sourceId: string;
      family: string;
      status: "ok" | "not_found" | "error";
      rateLimited: boolean;
      errorCategory: string | null;
      errorCode: string | null;
      metadata: {
        description: string | null;
      } | null;
      links: {
        website: string | null;
        x: string | null;
        telegram: string | null;
        anyLinks: boolean;
      } | null;
      detail: Record<string, unknown> | null;
    }>;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-context-compare-source-families-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
  await execFileAsync("bash", ["-lc", "pnpm exec prisma db push --skip-generate"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runContextCompareSourceFamilies(
  args: string[],
  options?: {
    databaseUrl?: string;
    geckoSnapshotFile?: string;
    geckoTopPoolsFile?: string;
    dexscreenerProfilesFile?: string;
    metaplexFixtureFile?: string;
    solanaRpcUrl?: string;
  },
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `context-compare-source-families-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `context-compare-source-families-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/contextCompareSourceFamilies.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(options?.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}),
          ...(options?.geckoSnapshotFile
            ? { GECKOTERMINAL_TOKEN_SNAPSHOT_FILE: options.geckoSnapshotFile }
            : {}),
          ...(options?.geckoTopPoolsFile
            ? {
                GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE: options.geckoTopPoolsFile,
              }
            : {}),
          ...(options?.dexscreenerProfilesFile
            ? {
                DEXSCREENER_TOKEN_PROFILES_LATEST_V1_FILE: options.dexscreenerProfilesFile,
              }
            : {}),
          ...(options?.metaplexFixtureFile
            ? { METAPLEX_METADATA_URI_FILE: options.metaplexFixtureFile }
            : {}),
          ...(options?.solanaRpcUrl ? { LOWCAP_SOLANA_RPC_URL: options.solanaRpcUrl } : {}),
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

async function seedToken(databaseUrl: string, mint: string): Promise<void> {
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
        source: GECKO_ORIGIN_SOURCE,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("context:compare:source-families boundary", async (t) => {
  await t.test("supports deterministic source-family compare through fixture envs", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "context-compare-source-families.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const geckoTopPoolsFile = join(dir, "gecko-top-pools.json");
      const dexscreenerProfilesFile = join(dir, "dexscreener-profiles.json");
      const metaplexFixtureFile = join(dir, "metaplex-fixture.json");
      const pumpMint = "GeckoSourceFamiliesPump111111111111111111111111pump";
      const nonPumpMint = "GeckoSourceFamiliesNonPump11111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, pumpMint);
      await seedToken(databaseUrl, nonPumpMint);

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko family description",
                websites: ["https://example.com/gecko-family"],
                twitter_username: "gecko_family",
                telegram_handle: "geckofamily",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        geckoTopPoolsFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko top pools description",
                websites: ["https://example.com/gecko-top-pools"],
                twitter_username: "gecko_top_pools",
                telegram_handle: "geckotoppools",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        dexscreenerProfilesFile,
        JSON.stringify(
          [
            {
              tokenAddress: pumpMint,
              chainId: "solana",
              description: "dex family description",
              links: [
                {
                  type: "website",
                  url: "https://example.com/dex-family",
                },
                {
                  type: "twitter",
                  url: "https://x.com/dex_family",
                },
                {
                  type: "telegram",
                  url: "https://t.me/dexfamily",
                },
              ],
            },
          ],
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(
          {
            onchain: {
              mint: pumpMint,
              name: "metaplex onchain token",
              symbol: "MTPX",
              uri: "https://example.com/metaplex-family.json",
            },
            offchain: {
              name: "metaplex family token",
              symbol: "MTPX",
              description: "metaplex family description",
              external_url: "https://example.com/metaplex-family",
              extensions: {
                twitter: "metaplex_family",
                telegram: "metaplexfamily",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runContextCompareSourceFamilies(
        ["--limit", "1", "--sinceHours", "1"],
        {
          databaseUrl,
          geckoSnapshotFile,
          geckoTopPoolsFile,
          dexscreenerProfilesFile,
          metaplexFixtureFile,
        },
      );

      assert.equal(result.ok, true, result.stderr);
      if (!result.ok) return;

      const parsed = JSON.parse(result.stdout) as ContextCompareSourceFamiliesOutput;
      const summaryBySource = new Map(
        parsed.availabilitySummary.map((item) => [item.sourceId, item] as const),
      );
      const geckoSummary = summaryBySource.get("geckoterminal.token_snapshot");
      const geckoTopPoolsSummary = summaryBySource.get(
        "geckoterminal.token_snapshot_with_top_pools",
      );
      const dexscreenerSummary = summaryBySource.get("dexscreener.token_profiles_latest_v1");
      const metaplexSummary = summaryBySource.get("metaplex.metadata_uri");
      const sample = parsed.sampleResults[0];

      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.selection.sinceHours, 1);
      assert.equal(parsed.selection.limit, 1);
      assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.selection.geckoOriginTokenCount, 2);
      assert.equal(parsed.selection.skippedNonPumpCount, 1);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.comparedSources.length, 4);
      assert.deepEqual(
        parsed.comparedSources.map((item) => item.id),
        [
          "geckoterminal.token_snapshot",
          "geckoterminal.token_snapshot_with_top_pools",
          "dexscreener.token_profiles_latest_v1",
          "metaplex.metadata_uri",
        ],
      );
      assert.equal(geckoSummary?.family, "geckoterminal");
      assert.equal(geckoSummary?.okCount, 1);
      assert.equal(geckoSummary?.fetchErrorCount, 0);
      assert.equal(geckoSummary?.descriptionAvailableCount, 1);
      assert.equal(geckoTopPoolsSummary?.family, "geckoterminal");
      assert.equal(geckoTopPoolsSummary?.okCount, 1);
      assert.equal(geckoTopPoolsSummary?.websiteAvailableCount, 1);
      assert.equal(dexscreenerSummary?.family, "dexscreener");
      assert.equal(dexscreenerSummary?.okCount, 1);
      assert.equal(dexscreenerSummary?.notFoundCount, 0);
      assert.equal(dexscreenerSummary?.fetchErrorCount, 0);
      assert.equal(metaplexSummary?.family, "metaplex");
      assert.equal(metaplexSummary?.okCount, 1);
      assert.equal(metaplexSummary?.notFoundCount, 0);
      assert.equal(metaplexSummary?.fetchErrorCount, 0);
      assert.deepEqual(parsed.metaplexDeepDive.fetchErrorBreakdown, {});
      assert.deepEqual(parsed.metaplexDeepDive.notFoundReasonSummary, {});
      assert.equal(parsed.metaplexDeepDive.okSummary.okWithOffchainCount, 1);
      assert.equal(parsed.metaplexDeepDive.okSummary.okWithoutOffchainCount, 0);
      assert.equal(parsed.metaplexDeepDive.okSummary.descriptionAvailableCount, 1);
      assert.equal(parsed.metaplexDeepDive.okSummary.websiteAvailableCount, 1);
      assert.equal(parsed.sampleResults.length, 1);
      assert.equal(sample?.mint, pumpMint);
      assert.equal(sample?.currentSource, GECKO_ORIGIN_SOURCE);
      assert.equal(sample?.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(sample?.selectionAnchorKind, "createdAt");
      assert.equal(sample?.sourceResults.length, 4);
      assert.deepEqual(
        sample?.sourceResults.map((item) => item.sourceId),
        [
          "geckoterminal.token_snapshot",
          "geckoterminal.token_snapshot_with_top_pools",
          "dexscreener.token_profiles_latest_v1",
          "metaplex.metadata_uri",
        ],
      );
      assert.equal(sample?.sourceResults.every((item) => item.status === "ok"), true);
      assert.equal(sample?.sourceResults.every((item) => item.rateLimited === false), true);
      assert.equal(sample?.sourceResults.find((item) => item.family === "dexscreener")?.metadata?.description, "dex family description");
      assert.equal(sample?.sourceResults.find((item) => item.family === "metaplex")?.detail?.uri, "https://example.com/metaplex-family.json");
    });
  });

  await t.test("keeps overall success while surfacing metaplex not_found details", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "context-compare-source-families-metaplex-not-found.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const geckoTopPoolsFile = join(dir, "gecko-top-pools.json");
      const dexscreenerProfilesFile = join(dir, "dexscreener-profiles.json");
      const pumpMint = "11111111111111111111111111111111pump";
      const nonPumpMint = "111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, pumpMint);
      await seedToken(databaseUrl, nonPumpMint);

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko family description",
                websites: ["https://example.com/gecko-family"],
                twitter_username: "gecko_family",
                telegram_handle: "geckofamily",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        geckoTopPoolsFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko top pools description",
                websites: ["https://example.com/gecko-top-pools"],
                twitter_username: "gecko_top_pools",
                telegram_handle: "geckotoppools",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        dexscreenerProfilesFile,
        JSON.stringify(
          [
            {
              tokenAddress: pumpMint,
              chainId: "solana",
              description: "dex family description",
              links: [
                {
                  type: "website",
                  url: "https://example.com/dex-family",
                },
                {
                  type: "twitter",
                  url: "https://x.com/dex_family",
                },
                {
                  type: "telegram",
                  url: "https://t.me/dexfamily",
                },
              ],
            },
          ],
          null,
          2,
        ),
        "utf-8",
      );

      const requests: Array<string> = [];
      const server = createServer((req, res) => {
        requests.push(req.url ?? "");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "lowcap-bot-context-compare-metaplex",
            result: {
              value: null,
            },
          }),
        );
      });

      const listenOutcome = await new Promise<
        | { ok: true; address: Exclude<ReturnType<typeof server.address>, string | null> }
        | { ok: false; error: NodeJS.ErrnoException }
      >((resolve) => {
        const handleError = (error: NodeJS.ErrnoException) => {
          server.off("listening", handleListening);
          resolve({ ok: false, error });
        };

        const handleListening = () => {
          server.off("error", handleError);

          const address = server.address();
          if (!address || typeof address === "string") {
            resolve({
              ok: false,
              error: Object.assign(new Error("metaplex not_found rpc stub did not return a TCP address"), {
                code: "INVALID_SERVER_ADDRESS",
              }),
            });
            return;
          }

          resolve({ ok: true, address });
        };

        server.once("error", handleError);
        server.once("listening", handleListening);
        server.listen(0, "127.0.0.1");
      });

      if (!listenOutcome.ok) {
        if (listenOutcome.error.code === "EPERM") {
          t.skip("loopback listen is not permitted in this sandbox");
          return;
        }

        throw listenOutcome.error;
      }

      const address = listenOutcome.address;

      try {
        const result = await runContextCompareSourceFamilies(
          ["--limit", "1", "--sinceHours", "1"],
          {
            databaseUrl,
            geckoSnapshotFile,
            geckoTopPoolsFile,
            dexscreenerProfilesFile,
            solanaRpcUrl: `http://127.0.0.1:${address.port}`,
          },
        );

        assert.equal(result.ok, true, result.stderr);
        if (!result.ok) return;

        const parsed = JSON.parse(result.stdout) as ContextCompareSourceFamiliesOutput;
        const metaplexSummary = parsed.availabilitySummary.find(
          (item) => item.sourceId === "metaplex.metadata_uri",
        );
        const metaplexSourceResult = parsed.sampleResults[0]?.sourceResults.find(
          (item) => item.sourceId === "metaplex.metadata_uri",
        );

        assert.equal(parsed.readOnly, true);
        assert.equal(parsed.selection.selectedCount, 1);
        assert.equal(metaplexSummary?.okCount, 0);
        assert.equal(metaplexSummary?.notFoundCount, 1);
        assert.equal(metaplexSummary?.fetchErrorCount, 0);
        assert.deepEqual(parsed.metaplexDeepDive.fetchErrorBreakdown, {});
        assert.deepEqual(parsed.metaplexDeepDive.notFoundReasonSummary, {
          metadata_account_missing: 1,
        });
        assert.equal(parsed.metaplexDeepDive.okSummary.okWithOffchainCount, 0);
        assert.equal(parsed.metaplexDeepDive.okSummary.okWithoutOffchainCount, 0);
        assert.equal(parsed.metaplexDeepDive.sampleDetails.length, 1);
        assert.equal(parsed.metaplexDeepDive.sampleDetails[0]?.mint, pumpMint);
        assert.equal(parsed.metaplexDeepDive.sampleDetails[0]?.status, "not_found");
        assert.equal(
          parsed.metaplexDeepDive.sampleDetails[0]?.detail?.reason,
          "metadata_account_missing",
        );
        assert.equal(metaplexSourceResult?.status, "not_found");
        assert.equal(metaplexSourceResult?.rateLimited, false);
        assert.equal(metaplexSourceResult?.errorCategory, null);
        assert.equal(metaplexSourceResult?.errorCode, null);
        assert.equal(requests.length, 1);
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    });
  });

  await t.test("keeps overall success while surfacing dexscreener not_found details", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "context-compare-source-families-dex-not-found.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");
      const geckoTopPoolsFile = join(dir, "gecko-top-pools.json");
      const dexscreenerProfilesFile = join(dir, "dexscreener-profiles.json");
      const metaplexFixtureFile = join(dir, "metaplex-fixture.json");
      const pumpMint = "GeckoSourceFamiliesDexNotFound111111111111111111pump";
      const nonPumpMint = "GeckoSourceFamiliesDexNotFoundNonPump11111111111111111";
      const otherDexMint = "GeckoSourceFamiliesDexOther1111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, pumpMint);
      await seedToken(databaseUrl, nonPumpMint);

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko family description",
                websites: ["https://example.com/gecko-family"],
                twitter_username: "gecko_family",
                telegram_handle: "geckofamily",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        geckoTopPoolsFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko top pools description",
                websites: ["https://example.com/gecko-top-pools"],
                twitter_username: "gecko_top_pools",
                telegram_handle: "geckotoppools",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        dexscreenerProfilesFile,
        JSON.stringify(
          [
            {
              tokenAddress: otherDexMint,
              chainId: "solana",
              description: "dex family description",
              links: [
                {
                  type: "website",
                  url: "https://example.com/dex-family",
                },
                {
                  type: "twitter",
                  url: "https://x.com/dex_family",
                },
                {
                  type: "telegram",
                  url: "https://t.me/dexfamily",
                },
              ],
            },
          ],
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(
          {
            onchain: {
              mint: pumpMint,
              name: "metaplex onchain token",
              symbol: "MTPX",
              uri: "https://example.com/metaplex-family.json",
            },
            offchain: {
              name: "metaplex family token",
              symbol: "MTPX",
              description: "metaplex family description",
              external_url: "https://example.com/metaplex-family",
              extensions: {
                twitter: "metaplex_family",
                telegram: "metaplexfamily",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runContextCompareSourceFamilies(
        ["--limit", "1", "--sinceHours", "1"],
        {
          databaseUrl,
          geckoSnapshotFile,
          geckoTopPoolsFile,
          dexscreenerProfilesFile,
          metaplexFixtureFile,
        },
      );

      assert.equal(result.ok, true, result.stderr);
      if (!result.ok) return;

      const parsed = JSON.parse(result.stdout) as ContextCompareSourceFamiliesOutput;
      const dexscreenerSummary = parsed.availabilitySummary.find(
        (item) => item.sourceId === "dexscreener.token_profiles_latest_v1",
      );
      const dexscreenerSourceResult = parsed.sampleResults[0]?.sourceResults.find(
        (item) => item.sourceId === "dexscreener.token_profiles_latest_v1",
      );

      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(dexscreenerSummary?.family, "dexscreener");
      assert.equal(dexscreenerSummary?.okCount, 0);
      assert.equal(dexscreenerSummary?.notFoundCount, 1);
      assert.equal(dexscreenerSummary?.fetchErrorCount, 0);
      assert.equal(parsed.sampleResults.length, 1);
      assert.equal(dexscreenerSourceResult?.status, "not_found");
      assert.equal(dexscreenerSourceResult?.rateLimited, false);
      assert.equal(dexscreenerSourceResult?.errorCategory, null);
      assert.equal(dexscreenerSourceResult?.errorCode, null);
      assert.equal(dexscreenerSourceResult?.metadata, null);
      assert.equal(dexscreenerSourceResult?.links, null);
    });
  });

  await t.test("keeps overall success while surfacing geckoterminal fetch_error details", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "context-compare-source-families-gecko-fetch-error.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot-invalid.json");
      const geckoTopPoolsFile = join(dir, "gecko-top-pools.json");
      const dexscreenerProfilesFile = join(dir, "dexscreener-profiles.json");
      const metaplexFixtureFile = join(dir, "metaplex-fixture.json");
      const pumpMint = "GeckoSourceFamiliesFetchError11111111111111111111pump";
      const nonPumpMint = "GeckoSourceFamiliesFetchErrorNonPump1111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, pumpMint);
      await seedToken(databaseUrl, nonPumpMint);

      await writeFile(geckoSnapshotFile, "{\n", "utf-8");

      await writeFile(
        geckoTopPoolsFile,
        JSON.stringify(
          {
            data: {
              id: `solana_${pumpMint}`,
              type: "token",
              attributes: {
                address: pumpMint,
                name: "context source family token",
                symbol: "CSF",
                description: "gecko top pools description",
                websites: ["https://example.com/gecko-top-pools"],
                twitter_username: "gecko_top_pools",
                telegram_handle: "geckotoppools",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        dexscreenerProfilesFile,
        JSON.stringify(
          [
            {
              tokenAddress: pumpMint,
              chainId: "solana",
              description: "dex family description",
              links: [
                {
                  type: "website",
                  url: "https://example.com/dex-family",
                },
                {
                  type: "twitter",
                  url: "https://x.com/dex_family",
                },
                {
                  type: "telegram",
                  url: "https://t.me/dexfamily",
                },
              ],
            },
          ],
          null,
          2,
        ),
        "utf-8",
      );

      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(
          {
            onchain: {
              mint: pumpMint,
              name: "metaplex onchain token",
              symbol: "MTPX",
              uri: "https://example.com/metaplex-family.json",
            },
            offchain: {
              name: "metaplex family token",
              symbol: "MTPX",
              description: "metaplex family description",
              external_url: "https://example.com/metaplex-family",
              extensions: {
                twitter: "metaplex_family",
                telegram: "metaplexfamily",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runContextCompareSourceFamilies(
        ["--limit", "1", "--sinceHours", "1"],
        {
          databaseUrl,
          geckoSnapshotFile,
          geckoTopPoolsFile,
          dexscreenerProfilesFile,
          metaplexFixtureFile,
        },
      );

      assert.equal(result.ok, true, result.stderr);
      if (!result.ok) return;

      const parsed = JSON.parse(result.stdout) as ContextCompareSourceFamiliesOutput;
      const geckoSummary = parsed.availabilitySummary.find(
        (item) => item.sourceId === "geckoterminal.token_snapshot",
      );
      const geckoTopPoolsSummary = parsed.availabilitySummary.find(
        (item) => item.sourceId === "geckoterminal.token_snapshot_with_top_pools",
      );
      const geckoSourceResult = parsed.sampleResults[0]?.sourceResults.find(
        (item) => item.sourceId === "geckoterminal.token_snapshot",
      );

      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(geckoSummary?.family, "geckoterminal");
      assert.equal(geckoSummary?.okCount, 0);
      assert.equal(geckoSummary?.notFoundCount, 0);
      assert.equal(geckoSummary?.fetchErrorCount, 1);
      assert.equal(geckoSummary?.rateLimitedCount, 0);
      assert.deepEqual(geckoSummary?.errorCategoryCounts, { unknown_error: 1 });
      assert.deepEqual(geckoSummary?.errorCodeCounts, {});
      assert.equal(geckoTopPoolsSummary?.okCount, 1);
      assert.equal(geckoTopPoolsSummary?.fetchErrorCount, 0);
      assert.equal(parsed.sampleResults.length, 1);
      assert.equal(geckoSourceResult?.status, "error");
      assert.equal(geckoSourceResult?.rateLimited, false);
      assert.equal(geckoSourceResult?.errorCategory, "unknown_error");
      assert.equal(geckoSourceResult?.errorCode, null);
      assert.equal(geckoSourceResult?.metadata, null);
      assert.equal(geckoSourceResult?.links, null);
    });
  });

  await t.test("rejects unknown args", async () => {
    const result = await runContextCompareSourceFamilies(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.notEqual(result.code, 0);
    }
    assert.equal(result.stdout.includes("Usage:"), true);
    assert.match(result.stderr, /Unknown arg: --mint/);
  });

  await t.test("returns an empty success result when no matching tokens exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "context-compare-source-families-empty.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-snapshot-empty.json");
      const geckoTopPoolsFile = join(dir, "gecko-top-pools-empty.json");
      const dexscreenerProfilesFile = join(dir, "dexscreener-profiles-empty.json");
      const metaplexFixtureFile = join(dir, "metaplex-fixture-empty.json");

      await runDbPush(databaseUrl);

      await writeFile(
        geckoSnapshotFile,
        JSON.stringify(
          {
            data: {
              id: "solana_unused",
              type: "token",
              attributes: {
                address: "unused",
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );
      await writeFile(geckoTopPoolsFile, await readFile(geckoSnapshotFile, "utf-8"), "utf-8");
      await writeFile(dexscreenerProfilesFile, "[]\n", "utf-8");
      await writeFile(
        metaplexFixtureFile,
        JSON.stringify(
          {
            onchain: {
              mint: "unused",
              uri: "https://example.com/unused.json",
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const result = await runContextCompareSourceFamilies(
        ["--limit", "5", "--sinceHours", "1"],
        {
          databaseUrl,
          geckoSnapshotFile,
          geckoTopPoolsFile,
          dexscreenerProfilesFile,
          metaplexFixtureFile,
        },
      );

      assert.equal(result.ok, true, result.stderr);
      if (!result.ok) return;

      const parsed = JSON.parse(result.stdout) as ContextCompareSourceFamiliesOutput;

      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.selection.sinceHours, 1);
      assert.equal(parsed.selection.limit, 5);
      assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.selection.geckoOriginTokenCount, 0);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.equal(parsed.selection.selectedCount, 0);
      assert.equal(parsed.comparedSources.length, 4);
      assert.equal(parsed.availabilitySummary.every((item) => item.totalChecked === 0), true);
      assert.equal(parsed.metaplexDeepDive.okSummary.okWithOffchainCount, 0);
      assert.equal(parsed.metaplexDeepDive.okSummary.okWithoutOffchainCount, 0);
      assert.deepEqual(parsed.metaplexDeepDive.fetchErrorBreakdown, {});
      assert.deepEqual(parsed.metaplexDeepDive.notFoundReasonSummary, {});
      assert.deepEqual(parsed.metaplexDeepDive.sampleDetails, []);
      assert.deepEqual(parsed.sampleResults, []);
    });
  });
});
