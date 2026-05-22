import fs from "node:fs/promises";
import path from "node:path";
function asString(value) {
    return String(value ?? "").trim();
}
function toCsv(rows) {
    if (!Array.isArray(rows))
        return "";
    return rows.map((row) => {
        const cells = Array.isArray(row) ? row : Object.values((row ?? {}));
        return cells.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",");
    }).join("\n");
}
export class SpreadsheetWorker {
    name = "spreadsheet_worker";
    async execute(input, context) {
        await context.log(`SpreadsheetWorker executing ${context.action}`);
        const filePath = asString(input.path);
        if (context.action === "spreadsheet.read") {
            if (!filePath)
                return { ok: false, error: "spreadsheet.read requires input.path" };
            const content = await fs.readFile(filePath, "utf8");
            const rows = content.split(/\r?\n/).filter(Boolean).map((line) => line.split(","));
            return { ok: true, output: { action: context.action, path: filePath, rows, count: rows.length }, artifacts: [filePath] };
        }
        if (context.action === "spreadsheet.write") {
            if (!filePath)
                return { ok: false, error: "spreadsheet.write requires input.path" };
            const csv = toCsv(input.rows);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, csv, "utf8");
            return { ok: true, output: { action: context.action, path: filePath, rowsWritten: csv ? csv.split(/\r?\n/).length : 0 }, artifacts: [filePath] };
        }
        if (context.action === "spreadsheet.summarize") {
            return { ok: true, output: { action: context.action, status: "summary_prepared", path: filePath } };
        }
        return { ok: false, error: `Unsupported spreadsheet action: ${context.action}` };
    }
}
