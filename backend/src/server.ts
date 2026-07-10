import { createApp } from "./app.js";
import { startUsageRefreshScheduler } from "./usageRefresh.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const app = await createApp();

const server = app.listen(port, host, () => {
  console.log(`SubLink 后端服务已启动：http://${host}:${port}`);
  startUsageRefreshScheduler(app.locals.store);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
