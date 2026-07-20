import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRunResult } from "./types.js";

// Session continuity: after each run we persist a compact summary inside the
// workspace; the next run injects it into the system prompt so follow-up
// tasks ("now also fix X") skip cold-start exploration.

const SESSION_FILE = [".oneclaw", "agent-session.json"];
// Sessions older than this are stale — the workspace likely changed.
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

type AgentSessionRecord = {
  version: 1;
  objective: string;
  status: string;
  summary: string;
  editedFiles: string[];
  commands: string[];
  finishedAt: string;
};

function sessionPath(workspace: string) {
  return path.join(workspace, ...SESSION_FILE);
}

export async function readPriorContext(workspace: string): Promise<string | null> {
  try {
    const raw = await readFile(sessionPath(workspace), "utf8");
    const record = JSON.parse(raw) as AgentSessionRecord;
    if (record.version !== 1) return null;
    const age = Date.now() - Date.parse(record.finishedAt);
    if (!Number.isFinite(age) || age > MAX_SESSION_AGE_MS) return null;

    return [
      `Objective: ${record.objective.slice(0, 400)}`,
      `Outcome (${record.status}): ${record.summary.slice(0, 600)}`,
      record.editedFiles.length ? `Files edited: ${record.editedFiles.slice(0, 20).join(", ")}` : "",
      record.commands.length ? `Commands run: ${record.commands.slice(-10).join(" | ").slice(0, 600)}` : "",
      `Finished: ${record.finishedAt}`,
    ].filter(Boolean).join("\n");
  } catch {
    return null;
  }
}

export async function writeSessionRecord(
  workspace: string,
  objective: string,
  result: AgentRunResult,
): Promise<void> {
  try {
    const record: AgentSessionRecord = {
      version: 1,
      objective,
      status: result.status,
      summary: result.summary.slice(0, 2_000),
      editedFiles: result.editedFiles.slice(0, 50),
      commands: result.commands.slice(-20),
      finishedAt: new Date().toISOString(),
    };
    await mkdir(path.dirname(sessionPath(workspace)), { recursive: true });
    await writeFile(sessionPath(workspace), JSON.stringify(record, null, 2), "utf8");
  } catch {
    // Continuity is best-effort; never fail the run over it.
  }
}
