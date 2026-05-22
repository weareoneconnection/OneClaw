function asString(value) {
    return String(value ?? "").trim();
}
function githubError(action, response) {
    const body = typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body);
    return `${action} GitHub API returned ${response.status}: ${body}`;
}
export class CodeWorker {
    github;
    name = "code_worker";
    constructor(github) {
        this.github = github;
    }
    async execute(input, context) {
        await context.log(`CodeWorker executing ${context.action}`);
        const provider = asString(input.provider || "github");
        const repo = asString(input.repo);
        if (context.action === "git.issue.create") {
            const title = asString(input.title);
            if (!repo || !title)
                return { ok: false, error: "git.issue.create requires input.repo and input.title" };
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
            if (!repo || !title || !branch)
                return { ok: false, error: "git.pr.create requires input.repo, input.title, and input.branch" };
            return { ok: true, output: { provider, action: context.action, status: "pull_request_prepared", repo, title, branch, base: asString(input.base || "main") } };
        }
        if (context.action === "git.ci.status") {
            if (!repo)
                return { ok: false, error: "git.ci.status requires input.repo" };
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
        if (context.action === "git.repo.search") {
            const query = asString(input.query);
            if (!query)
                return { ok: false, error: "git.repo.search requires input.query" };
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
