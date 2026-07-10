# Cloudflare 免费部署说明

本项目已支持一套 Cloudflare 免费方案：

- 前端：Cloudflare Pages
- 后端 API：Pages Functions
- 数据库：Cloudflare D1
- 订阅接口：同域名 `/sub/{token}`

本地 Express + SQLite 版本仍然保留，Cloudflare 版本使用 `frontend/functions/[[path]].ts` 和 D1。

## 1. 安装依赖

```powershell
npm install --prefix frontend
```

## 2. 登录 Cloudflare

```powershell
npm --prefix frontend exec wrangler login
```

## 3. 创建 D1 数据库

```powershell
npm run cf:d1:create
```

命令会输出类似内容：

```toml
[[d1_databases]]
binding = "DB"
database_name = "sublink"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把输出里的 `database_id` 填到：

```text
frontend/wrangler.toml
```

替换这一行：

```toml
database_id = "替换为你的 D1 database_id"
```

`binding` 必须保持 `DB`。

## 4. 初始化远程数据库

```powershell
npm run cf:d1:migrate:remote
```

升级到 1.4.0 时必须先应用 `0003_operations.sql`，再部署新版 Pages Functions。该迁移会增加上游健康信息和管理员操作审计表；请求链路不再重复执行建表和客户端种子逻辑。

## 5. 本地 Cloudflare 模式测试

先初始化本地 D1：

```powershell
npm run cf:d1:migrate:local
```

启动 Cloudflare Pages 本地开发服务：

```powershell
npm run cf:dev
```

默认测试账号：

```text
管理员：admin / admin123
普通用户：user / user123
```

## 6. 部署到 Cloudflare Pages

```powershell
npm run cf:deploy
```

首次部署后，在 Cloudflare Pages 项目里确认 D1 绑定：

```text
变量名 / Binding：DB
D1 数据库：sublink
```

如果使用 GitHub 自动部署：

```text
构建命令：npm install --prefix frontend && npm --prefix frontend run build
构建输出目录：frontend/dist
根目录：D:\Project\SubLink 或仓库根目录
```

如果 Cloudflare Pages 的 Root directory 设置为 `frontend`：

```text
构建命令：npm install && npm run build
构建输出目录：dist
```

## 7. JWT 密钥

建议在 Cloudflare Pages 环境变量里设置：

```text
JWT_SECRET=一串足够长的随机字符串
```

不设置也能运行，但不适合长期公网使用。

## 8. 免费额度注意

Cloudflare 免费方案适合个人、小流量使用。订阅客户端频繁刷新会消耗 Pages Functions / Workers 请求次数和 D1 查询次数。

这个项目的每次登录、读取订阅、拉取 `/sub/{token}`、写访问日志都会产生函数请求，部分请求还会产生多次 D1 查询。

## 9. 当前 Cloudflare 版本和本地版本差异

Cloudflare 版本使用 Web Crypto 的 PBKDF2 保存密码，和本地 Express 版本的 bcrypt 不互通。

也就是说：

- 本地 SQLite 数据不会自动迁移到 D1。
- Cloudflare D1 会自动初始化默认账号。
- 如果要迁移现有用户，需要单独写迁移脚本。
