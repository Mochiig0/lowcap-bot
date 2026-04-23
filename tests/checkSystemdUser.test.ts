import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function writeStubExecutable(
  dir: string,
  name: string,
  content: string,
): Promise<void> {
  const stubPath = join(dir, name);
  await writeFile(stubPath, content, "utf-8");
  await chmod(stubPath, 0o755);
}

async function runCheckSystemdUser(stubDir: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "/bin/bash",
      ["scripts/check-systemd-user.sh"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: `${stubDir}:/usr/bin:/bin`,
          USER: "lowcap-test-user",
          XDG_RUNTIME_DIR: "/tmp/lowcap-runtime-dir",
          DBUS_SESSION_BUS_ADDRESS: "unix:path=/tmp/lowcap-bus",
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

test("check-systemd-user preflight boundary", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "lowcap-systemd-user-"));

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test("recommends systemd-user when the user service preflight is ready", async () => {
    await writeStubExecutable(
      tempDir,
      "systemctl",
      `#!/usr/bin/env bash
if [[ "$1" == "--user" && "$2" == "show-environment" ]]; then
  exit 0
fi
exit 0
`,
    );
    await writeStubExecutable(
      tempDir,
      "loginctl",
      `#!/usr/bin/env bash
if [[ "$1" == "show-user" ]]; then
  exit 0
fi
exit 0
`,
    );

    const result = await runCheckSystemdUser(tempDir);

    assert.equal(result.ok, true);
    assert.match(result.stdout, /^systemctlUserReady=true/m);
    assert.match(result.stdout, /^loginctlUserReady=true/m);
    assert.match(result.stdout, /^recommendedMode=systemd-user$/m);
    assert.match(
      result.stdout,
      /^sampleUnit=.*ops\/systemd\/lowcap-bot-dexscreener-watch\.service$/m,
    );
    assert.match(
      result.stdout,
      /^runScript=.*scripts\/run-detect-dexscreener-watch\.sh$/m,
    );
    assert.match(
      result.stderr,
      /systemd --user looks available\. Install the sample unit and start it with systemctl --user\./,
    );
  });

  await t.test("falls back to tmux when systemd-user is not ready but tmux exists", async () => {
    await writeStubExecutable(
      tempDir,
      "systemctl",
      `#!/usr/bin/env bash
if [[ "$1" == "--user" && "$2" == "show-environment" ]]; then
  exit 1
fi
exit 1
`,
    );
    await writeStubExecutable(
      tempDir,
      "loginctl",
      `#!/usr/bin/env bash
if [[ "$1" == "show-user" ]]; then
  exit 1
fi
exit 1
`,
    );
    await writeStubExecutable(
      tempDir,
      "tmux",
      `#!/usr/bin/env bash
exit 0
`,
    );

    const result = await runCheckSystemdUser(tempDir);

    assert.equal(result.ok, true);
    assert.match(result.stdout, /^systemctlUserReady=false$/m);
    assert.match(result.stdout, /^loginctlUserReady=false$/m);
    assert.match(result.stdout, /^recommendedMode=tmux$/m);
    assert.match(
      result.stdout,
      /^tmuxCommand=tmux new -s lowcap-bot-watch 'cd .* && bash \.\/scripts\/run-detect-dexscreener-watch\.sh'$/m,
    );
    assert.match(
      result.stdout,
      /^foregroundCommand=bash .*scripts\/run-detect-dexscreener-watch\.sh$/m,
    );
    assert.match(
      result.stderr,
      /systemd --user is not ready here\. Use tmux with the run script instead\./,
    );
  });
});
