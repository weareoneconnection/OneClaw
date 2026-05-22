function splitRepo(repo, defaultOwner) {
    const clean = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
    const parts = clean.split("/").filter(Boolean);
    if (parts.length >= 2)
        return { owner: parts[0], repo: parts[1] };
    if (defaultOwner && parts.length === 1)
        return { owner: defaultOwner, repo: parts[0] };
    throw new Error("GitHub repo must be owner/repo or configure GITHUB_DEFAULT_OWNER.");
}
export class GitHubAdapter {
    params;
    constructor(params) {
        this.params = params;
    }
    isConfigured() {
        return Boolean(this.params.token);
    }
    headers() {
        if (!this.params.token)
            throw new Error("GITHUB_TOKEN is not configured.");
        return {
            Authorization: `Bearer ${this.params.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        };
    }
    async searchRepos(query) {
        const scopedQuery = this.params.defaultOwner && !/user:|org:/i.test(query)
            ? `${query} user:${this.params.defaultOwner}`
            : query;
        return this.params.http.request("https://api.github.com/search/repositories", {
            method: "GET",
            headers: this.headers(),
            query: { q: scopedQuery, per_page: 10 },
        });
    }
    async createIssue(input) {
        const target = splitRepo(input.repo, this.params.defaultOwner);
        return this.params.http.request(`https://api.github.com/repos/${target.owner}/${target.repo}/issues`, {
            method: "POST",
            headers: this.headers(),
            body: {
                title: input.title,
                body: input.body ?? "",
            },
        });
    }
    async getRepo(repo) {
        const target = splitRepo(repo, this.params.defaultOwner);
        return this.params.http.request(`https://api.github.com/repos/${target.owner}/${target.repo}`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async getCiStatus(input) {
        const target = splitRepo(input.repo, this.params.defaultOwner);
        const ref = input.ref || "main";
        return this.params.http.request(`https://api.github.com/repos/${target.owner}/${target.repo}/commits/${encodeURIComponent(ref)}/status`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async listChecks(input) {
        const target = splitRepo(input.repo, this.params.defaultOwner);
        const ref = input.ref || "main";
        return this.params.http.request(`https://api.github.com/repos/${target.owner}/${target.repo}/commits/${encodeURIComponent(ref)}/check-runs`, {
            method: "GET",
            headers: this.headers(),
            query: { per_page: 20 },
        });
    }
    async listActionRuns(input) {
        const target = splitRepo(input.repo, this.params.defaultOwner);
        return this.params.http.request(`https://api.github.com/repos/${target.owner}/${target.repo}/actions/runs`, {
            method: "GET",
            headers: this.headers(),
            query: {
                per_page: 20,
                ...(input.branch ? { branch: input.branch } : {}),
            },
        });
    }
}
