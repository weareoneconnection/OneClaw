import "dotenv/config";
import { bootstrap } from "./bootstrap.js";
const services = await bootstrap({ workerOnly: true });
if (services.queue.mode !== "bullmq") {
    console.log("Worker not started because ONECLAW_QUEUE_MODE is not 'bullmq'.");
    process.exit(0);
}
await services.queue.startWorker();
console.log("OneClaw V5 worker started.");
