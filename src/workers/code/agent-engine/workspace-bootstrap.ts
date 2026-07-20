import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Cloud workspace bootstrap: Railway's filesystem is ephemeral, so on boot we
// clone the repos listed in ONECLAW_WORKSPACE_GIT_URLS into the workspace
// root. Local setups leave the variable empty and nothing happens.
//
//   ONECLAW_WORKSPACE_GIT_URLS=https://github.com/org/repo.git,https://token@github.com/org/private.git
//   ONECLAW_WORKSPACE_CLONE_ROOT=/app/workspaces   (default)

function repoDirName(url: string) {
  const cleaned = url.replace(/\.git$/, "").replace(/\/+$/, "");
  return cleaned.split("/").pop() || "workspace";
}

export async function bootstrapWorkspaces(): Promise<void> {
  const urls = String(process.env.ONECLAW_WORKSPACE_GIT_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!urls.length) return;

  const root = path.resolve(process.env.ONECLAW_WORKSPACE_CLONE_ROOT || "/app/workspaces");
  await mkdir(root, { recursive: true });

  for (const url of urls) {
    const target = path.join(root, repoDirName(url));
    const exists = await stat(path.join(target, ".git")).then(() => true).catch(() => false);
    try {
      if (exists) {
        await execFileAsync("git", ["-C", target, "pull", "--ff-only"], { timeout: 120_000 });
        console.log(`[workspace-bootstrap] updated ${target}`);
      } else {
        await execFileAsync("git", ["clone", "--depth", "1", url, target], { timeout: 300_000 });
        console.log(`[workspace-bootstrap] cloned ${repoDirName(url)} -> ${target}`);
      }
    } catch (error) {
      // A failed clone must not stop the server; the code runtime will just
      // report the workspace as missing.
      console.error(`[workspace-bootstrap] failed for ${repoDirName(url)}:`, (error as Error).message);
    }
  }
}
