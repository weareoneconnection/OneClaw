function asString(value) {
    return String(value ?? "").trim();
}
export class SearchWorker {
    config;
    httpAdapter;
    name = "search_worker";
    constructor(config, httpAdapter) {
        this.config = config;
        this.httpAdapter = httpAdapter;
    }
    async execute(input, context) {
        await context.log(`SearchWorker executing ${context.action}`);
        const query = asString(input.query);
        if (!query)
            return { ok: false, error: `${context.action} requires input.query` };
        if (!this.config.searchEndpoint) {
            return { ok: true, output: { provider: "search", action: context.action, status: "search_prepared", query, results: [] } };
        }
        const response = await this.httpAdapter.request(this.config.searchEndpoint, {
            method: "GET",
            query: { q: query },
        });
        return { ok: true, output: { provider: "search", action: context.action, query, response: response.body } };
    }
}
