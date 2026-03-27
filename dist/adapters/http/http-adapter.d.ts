import type { Json } from "../../types/task.js";
export declare class HttpAdapter {
    request(url: string, method: string, body?: Json): Promise<{
        status: number;
        body: Json | string;
    }>;
}
