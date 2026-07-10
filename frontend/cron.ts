import { refreshUpstreamUsage } from "./functions/usageRefresh.js";

type Env = { DB: Parameters<typeof refreshUpstreamUsage>[0] };

export default {
  async scheduled(_controller: unknown, env: Env) {
    const result = await refreshUpstreamUsage(env.DB);
    console.log(JSON.stringify({ event: "usage-refresh", ...result }));
  }
};
