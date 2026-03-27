import fetch from "node-fetch";
export class HttpAdapter {
    async request(url, method, body) {
        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "OneClaw/0.2",
            },
            body: body === undefined || method.toUpperCase() === "GET" ? undefined : JSON.stringify(body),
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
            return { status: response.status, body: (await response.json()) };
        }
        return { status: response.status, body: await response.text() };
    }
}
