# SubLink 本地全栈订阅管理系统设计

## 目标

构建一个可直接本地测试的订阅管理系统，包含网页前端和后端服务。系统用于普通用户查看和复制订阅链接，管理员管理用户、上游订阅配置和访问日志。

## 技术栈

前端使用 Vite、React、TypeScript、Tailwind CSS、shadcn/ui 和 lucide-react。前端为单页应用，使用 React Router 管理路由，所有界面文案使用简体中文。

后端使用 Node.js、Express、TypeScript 和 SQLite。后端启动时自动创建数据表并写入本地测试账号，方便直接验证登录、订阅链接、用户管理、上游配置和访问日志。

## 本地运行形态

仓库采用前后端分离但同仓库管理：

- `frontend/`：Vite React 前端。
- `backend/`：Express API 服务。
- `backend/data/sublink.db`：本地 SQLite 数据库，由后端自动创建。

开发时分别启动前端和后端。前端通过 Vite 代理请求 `/api` 和 `/sub` 到后端，浏览器只需要访问前端地址即可完成测试。

默认测试账号：

- 管理员：`admin / admin123`
- 普通用户：`user / user123`

## 前端路由

- `/login`：登录页。
- `/user/subscription`：我的订阅。
- `/user/profile`：个人资料，首版展示基础账号信息。
- `/admin/dashboard`：管理仪表盘。
- `/admin/users`：用户管理。
- `/admin/users/:id`：用户详情。
- `/admin/upstreams`：全局上游配置。
- `/admin/logs`：访问日志。
- `/admin/settings`：系统设置，首版展示基础设置占位和后续扩展入口。

登录后根据角色跳转：管理员进入 `/admin/dashboard`，普通用户进入 `/user/subscription`。

## 前端布局与组件

界面使用简洁现代的 SaaS 管理后台风格，支持浅色和深色模式。桌面端采用顶部导航栏、左侧菜单栏、主内容区域；移动端采用顶部栏和抽屉菜单。

优先使用 shadcn/ui 组件：

- `Button`
- `Card`
- `Input`
- `Label`
- `Dialog`
- `DropdownMenu`
- `Table`
- `Badge`
- `Tabs`
- `Switch`
- `Select`
- `Alert`
- `Sonner`
- `Sheet`
- `Separator`
- `Skeleton`

图标统一使用 lucide-react。所有按钮、表格字段、状态、提示、Toast、空状态和错误信息使用简体中文，不出现英文占位文案。

## 用户前台

用户登录后进入“我的订阅”。页面包含：

1. 账号状态卡片，显示用户名、账号状态、到期时间、最近使用客户端和最近访问时间。
2. 通用订阅链接卡片，显示 `/sub/{token}`，提供“复制链接”和“重置 Token”按钮。
3. 专用客户端订阅链接列表，显示 Clash、Mihomo、Shadowrocket、SingBox、Surge、Loon、Stash、Quantumult X、Egern，每项包含客户端名称、订阅链接、启用状态和复制按钮。
4. 使用说明，说明推荐优先使用通用订阅链接、客户端无法自动识别时使用专用链接、Token 重置后旧链接立即失效。

复制成功显示 Toast：“复制成功”。重置 Token 需要二次确认。

## 管理后台

仪表盘展示用户总数、启用用户数、停用用户数、今日订阅请求数和最近访问记录。

用户管理使用表格展示用户名、状态、到期时间、备注、最近访问时间和操作。操作包括编辑、启用、停用、重置 Token、配置上游和删除。停用、重置 Token、删除均需要二次确认。

全局上游配置页面按客户端展示 default、clash、mihomo、shadowrocket、singbox、surge、loon、stash、quantumultx、egern、v2ray。所有用户共用同一套上游配置。每行包含客户端、上游订阅链接输入框、启用状态、保存按钮和测试上游按钮。

访问日志展示用户名、客户端、IP、User-Agent、状态、响应时间和访问时间。

## 后端 API

认证：

- `POST /api/auth/login`：登录，返回 Token 和用户信息。
- `GET /api/auth/me`：获取当前登录用户。

用户前台：

- `GET /api/user/subscription`：获取当前用户订阅信息和客户端链接。
- `POST /api/user/reset-token`：当前用户重置 Token。

管理后台：

- `GET /api/admin/dashboard`：仪表盘统计。
- `GET /api/admin/users`：用户列表。
- `POST /api/admin/users`：创建用户。
- `GET /api/admin/users/:id`：用户详情。
- `PATCH /api/admin/users/:id`：编辑用户。
- `POST /api/admin/users/:id/enable`：启用用户。
- `POST /api/admin/users/:id/disable`：停用用户。
- `POST /api/admin/users/:id/reset-token`：重置用户 Token。
- `DELETE /api/admin/users/:id`：删除用户。
- `GET /api/admin/upstreams`：获取全局上游配置。
- `PUT /api/admin/upstreams/:client`：保存单个客户端全局上游配置。
- `POST /api/admin/upstreams/:client/test`：测试全局上游链接。
- `GET /api/admin/logs`：访问日志列表。
- `GET /api/admin/settings`：系统设置。
- `PUT /api/admin/settings`：保存系统设置。

订阅访问：

- `GET /sub/:token`：通用订阅链接。
- `GET /sub/:token/:client`：客户端专用订阅链接。

订阅访问会校验 Token、用户状态和到期时间，并写入访问日志。若对应客户端启用了上游 URL，后端会尝试请求上游内容并返回；若未配置上游，返回本地模拟订阅内容，便于本地测试闭环。

## 数据表

`users`：

- `id`
- `username`
- `password_hash`
- `role`
- `status`
- `expires_at`
- `remark`
- `token`
- `last_client`
- `last_access_at`
- `created_at`
- `updated_at`

`upstreams`：

- `id`
- `client`
- `url`
- `enabled`
- `created_at`
- `updated_at`

`access_logs`：

- `id`
- `user_id`
- `username`
- `client`
- `ip`
- `user_agent`
- `status`
- `response_time_ms`
- `accessed_at`

`settings`：

- `key`
- `value`
- `updated_at`

## 状态与文案

状态 Badge：

- `active`：正常
- `disabled`：停用
- `expired`：已过期

客户端显示名：

- `default`：默认
- `clash`：Clash
- `mihomo`：Mihomo
- `shadowrocket`：Shadowrocket
- `singbox`：SingBox
- `surge`：Surge
- `loon`：Loon
- `stash`：Stash
- `quantumultx`：Quantumult X
- `egern`：Egern
- `v2ray`：V2Ray

错误提示：

- 账号或密码错误
- 账号已被停用
- 订阅链接已失效
- 上游链接不可用
- 服务器内部错误

表单和操作 Toast：

- 保存成功
- 保存失败
- 创建成功
- 删除成功
- 操作失败
- 复制成功

## 错误处理与加载状态

所有页面初次加载使用 Skeleton。数据为空时显示中文空状态。危险操作统一通过确认弹窗二次确认。接口错误会显示中文 Toast，并保留当前页面状态，避免用户误以为操作已成功。

## 验证标准

本地实现完成后至少验证：

- 前端构建通过。
- 后端 TypeScript 检查或构建通过。
- 后端健康接口可访问。
- 管理员可以登录并访问仪表盘、用户管理、上游配置和访问日志。
- 普通用户可以登录并查看、复制、重置订阅链接。
- `/sub/:token` 和 `/sub/:token/:client` 可以返回订阅内容并写入访问日志。
