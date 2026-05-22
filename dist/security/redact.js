const secretKeyPattern = /(authorization|cookie|token|secret|password|passwd|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|smtp_pass|stripe_secret)/i;
export function redactText(value) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
        .replace(/(x-api-key|api_key|token|password|secret)=([^&\s]+)/gi, "$1=[REDACTED]");
}
export function redactJson(value) {
    if (value === null || value === undefined)
        return value;
    if (typeof value === "string")
        return redactText(value);
    if (typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.map((item) => redactJson(item));
    if (typeof value === "object") {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = secretKeyPattern.test(key) ? "[REDACTED]" : redactJson(item);
        }
        return out;
    }
    return value;
}
