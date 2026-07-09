# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

SubLink 是订阅管理系统：管理员管理用户、上游订阅链接、访问日志；用户获取按客户端分类的订阅链接（`/sub/{token}` 及 `/sub/{token}/{client}`）。前端 React + Vite，后端有两套**并行实现**（见架构一节）。

## 常用命令

在仓库根目录执行（npm workspaces 通过 `--prefix` 委派到子目录）：

```bash
npm run install:all              # 安装 backend + frontend 依赖
npm run dev                      # 并行启动 Express 后端(3001) + Vite 前端(5173)
npm run build                    # 编译 backend(tsc) 与 frontend(tsc + vite build)
npm run test                     # 运行 backend 的 vitest 套件
```

单独操作：

```bash
npm --prefix backend run dev     # 仅后端 (tsx watch)
npm --prefix backend test        # 后端测试
npx --prefix backend vitest run src/__tests__/api.test.ts -t "登录"   # 单个测试(按名称过滤)
npm --prefix frontend run typecheck   # 前端仅类型检查，不产出
```

Cloudflare 部署链路（详见 [docs/cloudflare-free-deploy.md](docs/cloudflare-free-deploy.md)）：

```bash
npm run cf:d1:create             # 创建 D1，把输出的 database_id 填入 frontend/wrangler.toml
npm run cf:d1:migrate:local      # 初始化本地 D1
npm run cf:dev                   # build 后用 wrangler pages dev 本地跑 CF 模式
npm run cf:d1:migrate:remote     # 初始化远程 D1
npm run cf:deploy                # build 后 wrangler pages deploy
```

前端访问 http://127.0.0.1:5173 ，后端 http://127.0.0.1:3001 。默认账号 `admin/admin123`、`user/user123`（后端首次启动自动创建）。

## 架构：两套后端实现，必须同步

这是本仓库最重要的一点。**同一套 API 与订阅逻辑存在两份独立实现**，改动业务逻辑时通常需要同时修改两边，否则本地与线上行为会分叉：

1. **本地 Express 后端** (`backend/src/`) — Node + Express 5 + `better-sqlite3`，同步 SQLite，密码用 **bcrypt**。开发/测试用。
2. **Cloudflare Pages Function** (`frontend/functions/[[path]].ts`) — 单文件 Worker，异步 **D1**，密码用 **Web Crypto PBKDF2**。生产部署用。

两者不共享代码：`clients` 列表、schema、`pickUpstream` 回退顺序、UA 客户端识别、订阅 handler 等在两处各写一遍。因为 hash 算法不同（bcrypt vs PBKDF2 + `password_salt` 列），**两套数据库的用户数据不互通**，本地 SQLite 不会自动迁移到 D1。

前端不感知后端是哪一套：Vite dev 把 `/api` 和 `/sub` 代理到 `:3001`（见 [vite.config.ts](frontend/vite.config.ts)）；CF 模式下 Pages Function 拦截 `/api/*` 与 `/sub/*`，其余交给静态资源。D1 的 schema 由 [migrations/0001_init.sql](frontend/migrations/0001_init.sql) 与 Function 内 `seed()` 的 `CREATE TABLE IF NOT EXISTS` 双重保证。

## 后端关键流程

- **认证**：登录返回 7 天 JWT（`Authorization: Bearer`）。Express 侧 `requireAuth`/`requireAdmin` 是中间件（[auth.ts](backend/src/auth.ts)）；CF 侧是每个请求调用的 `getAuthedUser`/`requireAdmin`。停用账号 401/403。
- **订阅签发** ([subscription.ts](backend/src/routes/subscription.ts) 与 Function 内 `handleSubscription`)：校验 token → 账号 `active` 且未过期 → `pickUpstream` 选上游（含 clash/mihomo/default 回退）→ 若 `settings.subscriptionMode === "redirect"` 则 302 跳转，否则代理 fetch 上游并透传 `subscription-userinfo` 等 header；无可用上游时返回本地 `sampleSubscription` 模拟内容。每次请求（含失败）都写 `access_logs`。
- **客户端识别**：URL 未带 `{client}` 时用 `detectClientFromUserAgent` 从 UA 推断。客户端清单集中在 [clients.ts](backend/src/clients.ts)（CF 侧有同名副本）。`userVisibleClients` 排除 `default` 和 `v2ray`。
- **数据存储**：Express 侧所有 SQL 封装在 [db.ts](backend/src/db.ts) 的 `Store` 接口后；`createStore` 里含轻量的运行时 schema 迁移（如 `ALTER TABLE ... ADD COLUMN must_change_password`）和默认账号种子逻辑。

## 前端结构

`@` 别名指向 `frontend/src`。路由在 [App.tsx](frontend/src/App.tsx)，`ProtectedLayout` 靠 localStorage 里的 token 做前端守卫。所有后端调用集中在 [lib/api.ts](frontend/src/lib/api.ts) 的 `api` 对象——**新增/修改接口时同步这里、两套后端和路由**。UI 用 shadcn/ui 源码模式（组件在 `components/ui/`，`shadcn` CLI + [components.json](frontend/components.json) 管理）+ Tailwind CSS v4 + lucide-react。`must_change_password` 用户会被引导到 `/user/force-password`。
