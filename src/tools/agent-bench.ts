// Agent Engine benchmark harness.
//
// Runs the coding-agent loop against a list of task fixtures and scores each
// run with the fixture's own verify command — the pass rate is the baseline
// number to compare after every engine change (SWE-bench-style, but cheap).
//
// Usage:
//   npm run bench:agent -- path/to/tasks.json
//
// Task file format (JSON array):
//   [{
//     "name": "fix-parse-amount",
//     "workspace": "/abs/path/to/fixture/repo",   // copied to a temp dir per run
//     "objective": "Fix parseAmount to handle negative input; make npm test pass",
//     "verify": "npm test",                        // exit 0 = pass
//     "maxTurns": 30                               // optional
//   }, ...]

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runAgentTask } from "../workers/code/agent-engine/loop.js";
import { getAgentEngineConfig } from "../workers/code/agent-engine/llm-client.js";

const execFileAsync = promisify(execFile);

type BenchTask = {
  name: string;
  workspace: string;
  objective: string;
  verify: string;
  maxTurns?: number;
};

type BenchResult = {
  name: string;
  status: string;
  verifyPassed: boolean;
  selfVerified: boolean;
  turns: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  durationMs: number;
  error?: string;
};

async function runVerify(workspace: string, command: string): Promise<boolean> {
  try {
    await execFileAsync("/bin/sh", ["-c", command], {
      cwd: workspace,
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, CI: "1" },
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const tasksFile = process.argv[2];
  if (!tasksFile) {
    console.error("Usage: npm run bench:agent -- path/to/tasks.json");
    process.exit(1);
  }
  if (!getAgentEngineConfig().apiKey) {
    console.error("ANTHROPIC_API_KEY is not configured — the benchmark needs a live engine.");
    process.exit(1);
  }

  const tasks = JSON.parse(await readFile(path.resolve(tasksFile), "utf8")) as BenchTask[];
  const results: BenchResult[] = [];

  for (const task of tasks) {
    const startedAt = Date.now();
    const scratch = await mkdtemp(path.join(os.tmpdir(), `agent-bench-${task.name}-`));
    console.log(`\n=== ${task.name} ===`);
    try {
      // Fresh copy per run so fixtures stay pristine and runs are comparable.
      await cp(task.workspace, scratch, {
        recursive: true,
        filter: (source) => !source.includes(`${path.sep}node_modules${path.sep}`),
      });

      const run = await runAgentTask({
        objective: task.objective,
        workspace: scratch,
        maxTurns: task.maxTurns || 30,
        onEvent: (event) => {
          if (event.type === "tool_call" || event.type === "done" || event.type === "error") {
            console.log(`  [${event.type}] ${event.detail.slice(0, 120)}`);
          }
        },
      });

      const verifyPassed = run.status === "completed" && await runVerify(scratch, task.verify);
      results.push({
        name: task.name,
        status: run.status,
        verifyPassed,
        selfVerified: run.verified,
        turns: run.turns,
        toolCalls: run.toolCalls,
        inputTokens: run.usage.inputTokens,
        outputTokens: run.usage.outputTokens,
        cacheReadInputTokens: run.usage.cacheReadInputTokens,
        durationMs: Date.now() - startedAt,
        error: run.error,
      });
      console.log(`  → ${run.status}; verify ${verifyPassed ? "PASS" : "FAIL"}; ${run.turns} turns; ${Date.now() - startedAt}ms`);
    } catch (error) {
      results.push({
        name: task.name,
        status: "harness_error",
        verifyPassed: false,
        selfVerified: false,
        turns: 0,
        toolCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`  → harness error: ${error instanceof Error ? error.message : error}`);
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const passed = results.filter((result) => result.verifyPassed).length;
  const report = {
    generatedAt: new Date().toISOString(),
    model: getAgentEngineConfig().model,
    passRate: results.length ? passed / results.length : 0,
    passed,
    total: results.length,
    totals: {
      inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
      outputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
      cacheReadInputTokens: results.reduce((sum, result) => sum + result.cacheReadInputTokens, 0),
    },
    results,
  };

  const reportPath = path.resolve(`agent-bench-report-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nPass rate: ${passed}/${results.length}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
