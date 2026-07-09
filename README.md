# SubLink 本地订阅管理系统

SubLink 是一个本地可测试的订阅管理系统，包含 React 前端和 Express 后端。

## 技术栈

- 前端：React、TypeScript、Vite、Tailwind CSS、shadcn/ui 组件源码模式、lucide-react。
- 后端：Node.js、Express、TypeScript、SQLite。
- 数据库：`backend/data/sublink.db`，后端启动时自动创建。

## 本地启动

先安装依赖：

```powershell
npm install
npm run install:all
```

启动前后端：

```powershell
npm run dev
```

访问前端：

```text
http://127.0.0.1:5173
```

后端接口：

```text
http://127.0.0.1:3001
```

## 默认账号

管理员：

```text
admin / admin123
```

普通用户：

```text
user / user123
```

## 页面路由

- `/login`：登录
- `/user/subscription`：我的订阅
- `/user/profile`：个人资料
- `/admin/dashboard`：仪表盘
- `/admin/users`：用户管理
- `/admin/users/:id`：用户详情
- `/admin/upstreams`：全局上游配置
- `/admin/logs`：访问日志
- `/admin/settings`：系统设置

## 订阅链接

用户登录后可在“我的订阅”复制通用订阅链接：

```text
/sub/{token}
```

也可以复制客户端专用链接：

```text
/sub/{token}/clash
/sub/{token}/mihomo
/sub/{token}/shadowrocket
/sub/{token}/singbox
/sub/{token}/surge
/sub/{token}/loon
/sub/{token}/stash
/sub/{token}/quantumultx
/sub/{token}/egern
```

订阅接口会校验 Token、账号状态和到期时间，并写入访问日志。没有配置上游链接时，后端会返回本地模拟订阅内容，便于直接测试。

## Turnstile

登录页已接入 Cloudflare Turnstile。前端使用站点密钥渲染组件，后端和 Cloudflare Pages Functions 会在登录前校验 `turnstileToken`。

本地 Express 后端启用校验：

```powershell
$env:TURNSTILE_SECRET_KEY="<你的 Turnstile Secret Key>"
npm run dev
```

Cloudflare Pages 部署时，把 Secret Key 配置为加密变量：

```powershell
cd frontend
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name sublink
```

## 验证命令

```powershell
npm run test
npm run build
```
