import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const app = await createApp();

app.listen(port, host, () => {
  console.log(`SubLink 后端服务已启动：http://${host}:${port}`);
});
