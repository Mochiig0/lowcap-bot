import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  buildHolderSafeSummaryReport,
  type HolderSafeSummaryReport,
} from "../src/observation/holderSafeSummaryReport.ts";
import type { HolderDistributionSafeSummary } from "../src/observation/holderDistributionSafeSummary.ts";

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

function validSummary(
  overrides: Partial<HolderDistributionSafeSummary> = {},
): HolderDistributionSafeSummary {
  return {
    topHolderPct: 12.5,
    top10HolderPct: 42.25,
    holderCount: 1234,
    freshWalletCount: 17,
    bundlerSignal: "low",
    sameFundingOriginSignal: "unknown",
    lpWalletExcluded: true,
    source: "rugcheck.safe_summary",
    observedAt: "2026-05-10T00:00:00.000Z",
    confidence: "medium",
    rawFree: true,
    secretFree: true,
    ...overrides,
  };
}

async function withTempDir<T>(
  fn: (ctx: { dir: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-holder-safe-summary-report-"));
  try {
    return await fn({ dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeJsonFixture(dir: string, name: string, input: unknown): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(input, null, 2), "utf-8");
  return path;
}

async function runHolderSafeSummaryReport(file: string): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-holder-safe-summary-cli-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          'node --import tsx src/cli/holderSafeSummaryReport.ts --file "$FIXTURE_FILE" >"$STDOUT_FILE" 2>"$STDERR_FILE"',
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            FIXTURE_FILE: file,
            STDOUT_FILE: stdoutPath,
            STDERR_FILE: stderrPath,
          },
        },
      );

      return {
        ok: true,
        stdout: (await readFile(stdoutPath, "utf-8")).trim(),
        stderr: (await readFile(stderrPath, "utf-8")).trim(),
      };
    } catch (error) {
      return {
        ok: false,
        stdout: (await readFile(stdoutPath, "utf-8").catch(() => "")).trim(),
        stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
        code: (error as { code?: number | null }).code ?? null,
      };
    }
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

function parseReport(stdout: string): HolderSafeSummaryReport {
  return JSON.parse(stdout) as HolderSafeSummaryReport;
}

function assertNoTradingGuidance(report: HolderSafeSummaryReport): void {
  const serializedHints = JSON.stringify(
    report.items.map((item) => item.riskReviewHints),
  );
  assert.doesNotMatch(serializedHints, /buy/i);
  assert.doesNotMatch(serializedHints, /sell/i);
  assert.doesNotMatch(serializedHints, /position/i);
  assert.doesNotMatch(serializedHints, /exit/i);
  assert.doesNotMatch(serializedHints, /should/i);
}

test("holder safe summary report handles a single valid fixture file", async () => {
  await withTempDir(async ({ dir }) => {
    const fixture = await writeJsonFixture(dir, "single.json", {
      mint: "SingleHolderReport111111111111111111",
      summary: validSummary({
        source: "manual_holder_review",
        confidence: "low",
      }),
    });

    const result = await runHolderSafeSummaryReport(fixture);
    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");

    const report = parseReport(result.stdout);
    assert.equal(report.mode, "read_only_holder_safe_summary_report");
    assert.equal(report.readOnly, true);
    assert.equal(report.willWrite, false);
    assert.equal(report.willFetch, false);
    assert.equal(report.advisoryOutput, false);
    assert.equal(report.inputCount, 1);
    assert.equal(report.validCount, 1);
    assert.equal(report.invalidCount, 0);
    assert.equal(report.items[0]?.status, "valid");
    assert.equal(report.items[0]?.mintOrLabel, "SingleHolderReport111111111111111111");
    assert.equal(report.items[0]?.source, "manual_holder_review");
    assert.equal(report.items[0]?.suggestedCommand, null);
    assert.deepEqual(report.items[0]?.issues, []);
    assertNoTradingGuidance(report);
  });
});

test("holder safe summary report handles valid and invalid items array", () => {
  const secretValue = "secret-api-key-value";
  const walletValue = "wallet-value-that-must-not-appear";
  const report = buildHolderSafeSummaryReport({
    items: [
      {
        mint: "ArrayValid111111111111111111111111",
        summary: validSummary({
          source: "external_holder_report",
          bundlerSignal: "none",
          sameFundingOriginSignal: "none",
        }),
      },
      {
        mint: "ArrayInvalidWallet1111111111111111",
        summary: {
          ...validSummary(),
          holders: [walletValue],
        },
      },
      {
        mint: "ArrayInvalidSecret1111111111111111",
        summary: {
          ...validSummary(),
          apiKey: secretValue,
        },
      },
      {
        mint: "ArrayInvalidPayload111111111111111",
        summary: {
          ...validSummary(),
          rawJson: {
            holders: [walletValue],
          },
        },
      },
    ],
  });

  assert.equal(report.inputCount, 4);
  assert.equal(report.validCount, 1);
  assert.equal(report.invalidCount, 3);
  assert.equal(report.items[0]?.status, "valid");
  assert.equal(report.items[1]?.status, "invalid");
  assert.equal(report.items[1]?.rejectedRawPayload, true);
  assert.ok(
    report.items[1]?.issues.some((issue) => /dangerous raw payload/.test(issue)),
  );
  assert.equal(report.items[2]?.status, "invalid");
  assert.equal(report.items[2]?.rejectedRawPayload, true);
  assert.ok(
    report.items[2]?.issues.some((issue) => /dangerous raw payload|unsafe raw payload/.test(issue)),
  );
  assert.equal(report.items[3]?.status, "invalid");
  assert.equal(report.items[3]?.rejectedRawPayload, true);
  assert.equal(report.willWrite, false);
  assert.equal(report.willFetch, false);
  assertNoTradingGuidance(report);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(walletValue));
  assert.doesNotMatch(serialized, new RegExp(secretValue));
  assert.doesNotMatch(serialized, /holders/);
  assert.doesNotMatch(serialized, /apiKey/);
  assert.doesNotMatch(serialized, /rawJson/);
});

test("holder safe summary report does not expose invalid raw payload values from file output", async () => {
  await withTempDir(async ({ dir }) => {
    const secretValue = "file-secret-api-key-value";
    const walletValue = "file-wallet-value-that-must-not-appear";
    const fixture = await writeJsonFixture(dir, "invalid.json", {
      items: [
        {
          mint: "FileInvalidWallet111111111111111",
          summary: {
            ...validSummary(),
            walletList: [walletValue],
          },
        },
        {
          mint: "FileInvalidSecret111111111111111",
          summary: {
            ...validSummary(),
            apiKey: secretValue,
          },
        },
        {
          mint: "FileInvalidPayload111111111111111",
          summary: {
            ...validSummary(),
            rawJson: {
              holders: [walletValue],
            },
          },
        },
      ],
    });

    const result = await runHolderSafeSummaryReport(fixture);
    assert.equal(result.ok, true);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, new RegExp(walletValue));
    assert.doesNotMatch(result.stdout, new RegExp(secretValue));

    const report = parseReport(result.stdout);
    assert.equal(report.inputCount, 3);
    assert.equal(report.validCount, 0);
    assert.equal(report.invalidCount, 3);
    assert.ok(report.items.every((item) => item.status === "invalid"));
    assert.ok(report.items.every((item) => item.rejectedRawPayload));
    assert.doesNotMatch(result.stdout, /walletList/);
    assert.doesNotMatch(result.stdout, /apiKey/);
    assert.doesNotMatch(result.stdout, /rawJson/);
  });
});

test("holder safe summary report reports malformed JSON safely", async () => {
  await withTempDir(async ({ dir }) => {
    const rawPayloadValue = "malformed-secret-value";
    const path = join(dir, "malformed.json");
    await writeFile(path, `{"apiKey":"${rawPayloadValue}",`, "utf-8");

    const result = await runHolderSafeSummaryReport(path);
    assert.equal(result.ok, false);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Invalid holder safe summary JSON file/);
    assert.doesNotMatch(result.stderr, new RegExp(rawPayloadValue));
    assert.doesNotMatch(result.stderr, /apiKey/);
  });
});

test("holder safe summary report reports missing file safely", async () => {
  const result = await runHolderSafeSummaryReport("/tmp/lowcap-missing-holder-safe-summary.json");

  assert.equal(result.ok, false);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unable to read holder safe summary file: ENOENT/);
  assert.doesNotMatch(result.stderr, /lowcap-missing-holder-safe-summary/);
});
