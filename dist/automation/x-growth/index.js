import { XGrowthRunner } from "./runner.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    const runner = new XGrowthRunner();
    console.log("[x-growth] autonomous loop started");
    while (true) {
        await runner.runLoop();
        await sleep(4 * 60 * 60 * 1000);
    }
}
main().catch((error) => {
    console.error("[x-growth] fatal error:", error);
    process.exit(1);
});
