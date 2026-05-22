import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import type { GitHubAdapter } from "../../adapters/github/github-adapter.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function githubError(action: string, response: { status: number; body: Json | string }) {
  const body = typeof response.body === "string"
    ? response.body
    : JSON.stringify(response.body);
  return `${action} GitHub API returned ${response.status}: ${body}`;
}

export class CodeWorker implements Worker {
  readonly name = "code_worker";

  constructor(private readonly github?: GitHubAdapter) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`CodeWorker executing ${context.action}`);
    const provider = asString(input.provider || "github");
    const repo = asString(input.repo);

    if (context.action === "git.issue.create") {
      const title = asString(input.title);
      if (!repo || !title) return { ok: false, error: "git.issue.create requires input.repo and input.title" };
      if (provider === "github" && this.github?.isConfigured()) {
        const response = await this.github.createIssue({ repo, title, body: asString(input.body) });
        return {
          ok: response.ok,
          error: response.ok ? undefined : githubError(context.action, response),
          output: {
            provider,
            action: context.action,
            status: response.ok ? "issue_created" : "issue_create_failed",
            repo,
            response: response.body,
          },
        };
      }
      return { ok: true, output: { provider, action: context.action, status: "issue_prepared", repo, title, body: asString(input.body) } };
    }

    if (context.action === "git.pr.create") {
      const title = asString(input.title);
      const branch = asString(input.branch);
      if (!repo || !title || !branch) return { ok: false, error: "git.pr.create requires input.repo, input.title, and input.branch" };
      return { ok: true, output: { provider, action: context.action, status: "pull_request_prepared", repo, title, branch, base: asString(input.base || "main") } };
    }

    if (context.action === "git.ci.status") {
      if (!repo) return { ok: false, error: "git.ci.status requires input.repo" };
      if (provider === "github" && this.github?.isConfigured()) {
        const response = await this.github.getCiStatus({ repo, ref: asString(input.ref) || undefined });
        return {
          ok: response.ok,
          error: response.ok ? undefined : githubError(context.action, response),
          output: {
            provider,
            action: context.action,
            status: response.ok ? "ci_status_read" : "ci_status_failed",
            repo,
            ref: asString(input.ref || "main"),
            response: response.body,
          },
        };
      }
      return { ok: true, output: { provider, action: context.action, status: "ci_status_prepared", repo, ref: asString(input.ref) } };
    }

    if (context.action === "git.repo.get") {
      if (!repo) return { ok: false, error: "git.repo.get requires input.repo" };
      if (provider === "github" && this.github?.isConfigured()) {
        const response = await this.github.getRepo(repo);
        return {
          ok: response.ok,
          error: response.ok ? undefined : githubError(context.action, response),
          output: {
            provider,
            action: context.action,
            status: response.ok ? "repo_read" : "repo_read_failed",
            repo,
            response: response.body,
          },
        };
      }
      return { ok: true, output: { provider, action: context.action, status: "repo_get_prepared", repo } };
    }

    if (context.action === "git.checks.list") {
      if (!repo) return { ok: false, error: "git.checks.list requires input.repo" };
      if (provider === "github" && this.github?.isConfigured()) {
        const response = await this.github.listChecks({ repo, ref: asString(input.ref) || undefined });
        return {
          ok: response.ok,
          error: response.ok ? undefined : githubError(context.action, response),
          output: {
            provider,
            action: context.action,
            status: response.ok ? "checks_read" : "checks_read_failed",
            repo,
            ref: asString(input.ref || "main"),
            response: response.body,
          },
        };
      }
      return { ok: true, output: { provider, action: context.action, status: "checks_list_prepared", repo, ref: asString(input.ref) } };
    }

    if (context.action === "git.actions.runs") {
      if (!repo) return { ok: false, error: "git.actions.runs requires input.repo" };
      if (provider === "github" && this.github?.isConfigured()) {
        const response = await this.github.listActionRuns({ repo, branch: asString(input.branch || input.ref) || undefined });
        return {
          ok: response.ok,
          error: response.ok ? undefined : githubError(context.action, response),
          output: {
            provider,
            action: context.action,
            status: response.ok ? "actions_runs_read" : "actions_runs_failed",
            repo,
            branch: asString(input.branch || input.ref),
            response: response.body,
          },
        };
      }
      return { ok: true, output: { provider, action: context.action, status: "actions_runs_prepared", repo, branch: asString(input.branch || input.ref) } };
    }

    if (context.action === "git.repo.search") {
      const query = asString(input.query);
      if (!query) return { ok: false, error: "git.repo.search requires input.query" };
      if (provider === "github" && this.github?.isConfigured()) {
        const response = await this.github.searchRepos(query);
        return {
          ok: response.ok,
          error: response.ok ? undefined : githubError(context.action, response),
          output: {
            provider,
            action: context.action,
            status: response.ok ? "repo_search_completed" : "repo_search_failed",
            query,
            response: response.body,
          },
        };
      }
      return { ok: true, output: { provider, action: context.action, status: "repo_search_prepared", query, results: [] } };
    }

    return { ok: false, error: `Unsupported code action: ${context.action}` };
  }
}
