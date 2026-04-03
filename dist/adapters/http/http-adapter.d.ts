import type { Json } from "../../types/task.js";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
export interface HttpRequestOptions {
    method?: HttpMethod | string;
    headers?: Record<string, string>;
    body?: Json;
    query?: Record<string, string | number | boolean | null | undefined>;
    timeoutMs?: number;
}
export interface HttpResponseData {
    status: number;
    ok: boolean;
    url: string;
    headers: Record<string, string>;
    body: Json | string;
}
export declare class HttpAdapter {
    private readonly defaults;
    constructor(defaults?: {
        timeoutMs?: number;
        userAgent?: string;
        headers?: Record<string, string>;
    });
    request(url: string, options?: HttpRequestOptions): Promise<HttpResponseData>;
    get(url: string, options?: Omit<HttpRequestOptions, "method" | "body">): Promise<HttpResponseData>;
    post(url: string, body?: Json, options?: Omit<HttpRequestOptions, "method" | "body">): Promise<HttpResponseData>;
    put(url: string, body?: Json, options?: Omit<HttpRequestOptions, "method" | "body">): Promise<HttpResponseData>;
    patch(url: string, body?: Json, options?: Omit<HttpRequestOptions, "method" | "body">): Promise<HttpResponseData>;
    delete(url: string, options?: Omit<HttpRequestOptions, "method" | "body">): Promise<HttpResponseData>;
}
