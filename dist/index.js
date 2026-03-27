import "dotenv/config";
import { bootstrap } from "./bootstrap.js";
import { createServer } from "./api/server.js";
const services = await bootstrap();
const app = createServer(services);
app.listen(services.config.port, () => {
    console.log(`OneClaw V5 API listening on http://localhost:${services.config.port}`);
    console.log(`Queue mode: ${services.config.queueMode}`);
});
