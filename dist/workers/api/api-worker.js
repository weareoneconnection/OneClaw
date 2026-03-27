export class ApiWorker {
    httpAdapter;
    name = "api_worker";
    constructor(httpAdapter) {
        this.httpAdapter = httpAdapter;
    }
    async execute(input, context) {
        context.log(`ApiWorker executing ${context.action}`);
        const url = String(input.url ?? "");
        if (!url)
            return { ok: false, error: "api.request requires input.url" };
        const method = String(input.method ?? "GET");
        const response = await this.httpAdapter.request(url, method, input.body);
        return {
            ok: true,
            output: {
                action: context.action,
                response,
            },
        };
    }
}
