import { HttpAdapter } from "../http/http-adapter.js";
export declare class GitHubAdapter {
    private readonly params;
    constructor(params: {
        token?: string;
        defaultOwner?: string;
        http: HttpAdapter;
    });
    isConfigured(): boolean;
    private headers;
    searchRepos(query: string): Promise<import("../http/http-adapter.js").HttpResponseData>;
    createIssue(input: {
        repo: string;
        title: string;
        body?: string;
    }): Promise<import("../http/http-adapter.js").HttpResponseData>;
    getCiStatus(input: {
        repo: string;
        ref?: string;
    }): Promise<import("../http/http-adapter.js").HttpResponseData>;
}
