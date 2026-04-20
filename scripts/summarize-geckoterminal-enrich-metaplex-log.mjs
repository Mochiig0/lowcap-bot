#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const SUMMARY_MARKER = "[token:enrich-rescore:geckoterminal]";

function usage() {
  console.error(
    "Usage: node ./scripts/summarize-geckoterminal-enrich-metaplex-log.mjs <enrich-fast-log-path>",
  );
}

function parseIntegerField(line, key) {
  const match = line.match(new RegExp(`(?:^|\\s)${key}=([0-9]+)(?:\\s|$)`));
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function parseCountMapField(line) {
  const match = line.match(/(?:^|\s)metaplexErrorKindCounts=(\{[^ ]*\})(?:\s|$)/);
  if (!match) {
    return { ok: false, reason: "missing metaplexErrorKindCounts field" };
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "metaplexErrorKindCounts is not a JSON object" };
    }

    const counts = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          ok: false,
          reason: `metaplexErrorKindCounts.${key} is not a finite number`,
        };
      }

      counts[key] = value;
    }

    return { ok: true, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid JSON: ${message}` };
  }
}

function accumulateCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

async function main() {
  const args = process.argv.slice(2).filter((value) => value !== "--");
  const logPath = args[0];
  if (!logPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const raw = await readFile(logPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const summaryLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(SUMMARY_MARKER)) {
      summaryLines.push({ lineNumber: index + 1, text: lines[index] });
    }
  }

  const parseErrors = [];
  const metaplexErrorKindTotals = {};
  const output = {
    totalCycles: 0,
    totalMetaplexAttemptedCount: 0,
    totalMetaplexAvailableCount: 0,
    totalMetaplexSavedCount: 0,
    metaplexErrorKindTotals: {},
  };

  for (const summaryLine of summaryLines) {
    const attempted = parseIntegerField(summaryLine.text, "metaplexAttemptedCount");
    const available = parseIntegerField(summaryLine.text, "metaplexAvailableCount");
    const saved = parseIntegerField(summaryLine.text, "metaplexSavedCount");
    const countMap = parseCountMapField(summaryLine.text);

    if (
      attempted === null ||
      available === null ||
      saved === null ||
      countMap.ok !== true
    ) {
      const reasons = [];
      if (attempted === null) {
        reasons.push("missing metaplexAttemptedCount");
      }
      if (available === null) {
        reasons.push("missing metaplexAvailableCount");
      }
      if (saved === null) {
        reasons.push("missing metaplexSavedCount");
      }
      if (countMap.ok !== true) {
        reasons.push(countMap.reason);
      }
      parseErrors.push({
        lineNumber: summaryLine.lineNumber,
        reason: reasons.join("; "),
      });
      continue;
    }

    output.totalCycles += 1;
    output.totalMetaplexAttemptedCount += attempted;
    output.totalMetaplexAvailableCount += available;
    output.totalMetaplexSavedCount += saved;
    accumulateCounts(metaplexErrorKindTotals, countMap.counts);
  }

  output.metaplexErrorKindTotals = Object.fromEntries(
    Object.entries(metaplexErrorKindTotals).sort(([left], [right]) => left.localeCompare(right)),
  );

  if (parseErrors.length > 0) {
    const details = parseErrors
      .map((entry) => `line ${entry.lineNumber}: ${entry.reason}`)
      .join("\n");
    console.error(
      [
        `Failed to parse ${parseErrors.length} enrich summary line(s) from ${logPath}.`,
        details,
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
