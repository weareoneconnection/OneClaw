import "dotenv/config";
import { bootstrap } from "./bootstrap.js";
import { createServer } from "./api/server.js";

const services = await bootstrap();
const app = createServer(services);

const port = Number(process.env.PORT || services.config.port || 8000);

app.listen(port, "0.0.0.0", () => {
  console.log(`OneClaw V5 API listening on port ${port}`);
  console.log(`Queue mode: ${services.config.queueMode}`);
});
