# SubLink Local Fullstack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable SubLink subscription management system with a Chinese React admin/user UI and an Express SQLite backend.

**Architecture:** The repository contains `backend/` for an Express TypeScript API and `frontend/` for a Vite React TypeScript SPA. SQLite is initialized automatically by the backend, and Vite proxies `/api` and `/sub` to the backend for local testing.

**Tech Stack:** Node.js, Express, TypeScript, SQLite, Vitest, Vite, React, React Router, Tailwind CSS, shadcn/ui component source pattern, lucide-react, Sonner.

---

## File Structure

- `package.json`: root workspace scripts for installing, building, testing, and running both apps.
- `backend/package.json`: backend dependencies and scripts.
- `backend/tsconfig.json`: backend TypeScript config.
- `backend/vitest.config.ts`: backend test config.
- `backend/src/app.ts`: Express app composition and route registration.
- `backend/src/server.ts`: backend listen entrypoint.
- `backend/src/db.ts`: SQLite connection, schema creation, seed data, query helpers.
- `backend/src/types.ts`: shared backend domain types.
- `backend/src/auth.ts`: password hashing, token signing, auth middleware, role guard.
- `backend/src/clients.ts`: supported client list and display labels.
- `backend/src/routes/auth.ts`: auth API.
- `backend/src/routes/user.ts`: user-facing API.
- `backend/src/routes/admin.ts`: admin API.
- `backend/src/routes/subscription.ts`: `/sub` endpoints and access-log writing.
- `backend/src/__tests__/api.test.ts`: backend behavior tests for login, subscription, admin operations, and logs.
- `frontend/package.json`: frontend dependencies and scripts.
- `frontend/index.html`: Vite HTML entry.
- `frontend/tsconfig.json`: frontend TypeScript config.
- `frontend/vite.config.ts`: Vite config with proxy.
- `frontend/tailwind.config.js`: Tailwind config.
- `frontend/postcss.config.js`: PostCSS config.
- `frontend/src/main.tsx`: React entrypoint.
- `frontend/src/App.tsx`: router tree and protected routes.
- `frontend/src/index.css`: Tailwind base and theme tokens.
- `frontend/src/lib/api.ts`: typed API client.
- `frontend/src/lib/copy.ts`: copy helper.
- `frontend/src/lib/utils.ts`: className and format helpers.
- `frontend/src/types/*.ts`: frontend domain types.
- `frontend/src/components/ui/*.tsx`: shadcn/ui component source files.
- `frontend/src/components/layout/*.tsx`: app shell, sidebar, mobile drawer, theme toggle.
- `frontend/src/components/subscription/*.tsx`: subscription cards and client link list.
- `frontend/src/pages/login/LoginPage.tsx`: login page.
- `frontend/src/pages/user/SubscriptionPage.tsx`: user subscription page.
- `frontend/src/pages/user/ProfilePage.tsx`: user profile page.
- `frontend/src/pages/admin/DashboardPage.tsx`: admin dashboard.
- `frontend/src/pages/admin/UsersPage.tsx`: admin user management.
- `frontend/src/pages/admin/UserDetailPage.tsx`: admin user detail.
- `frontend/src/pages/admin/UserUpstreamsPage.tsx`: global upstream configuration table.
- `frontend/src/pages/admin/LogsPage.tsx`: access logs.
- `frontend/src/pages/admin/SettingsPage.tsx`: settings page.

## Task 1: Backend Foundation and Tests

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/src/types.ts`
- Create: `backend/src/clients.ts`
- Create: `backend/src/db.ts`
- Create: `backend/src/auth.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Create: `backend/src/__tests__/api.test.ts`

- [ ] **Step 1: Write backend API tests first**

Create tests that expect:

- `POST /api/auth/login` accepts `admin/admin123` and returns a bearer token with role `admin`.
- `POST /api/auth/login` rejects a bad password with `账号或密码错误`.
- `GET /api/user/subscription` returns Chinese-ready subscription data for `user/user123`.
- `POST /api/user/reset-token` changes the subscription token.
- `GET /sub/:token/clash` returns subscription text and writes an access log.
- Admin can list users, disable a user, reset token, and save a global upstream.

Run: `npm --prefix backend test`

Expected: tests fail because backend files are not implemented.

- [ ] **Step 2: Implement backend schema and seed data**

Implement SQLite tables `users`, `upstreams`, `access_logs`, and `settings`. Seed `admin/admin123` and `user/user123` if missing. Store password hashes with bcrypt and generate URL-safe tokens with Node crypto.

- [ ] **Step 3: Implement auth and route modules**

Implement bearer auth middleware, admin role guard, auth routes, user routes, admin routes, and subscription routes. Return Chinese error messages from API failures.

- [ ] **Step 4: Run backend tests**

Run: `npm --prefix backend test`

Expected: all tests pass.

## Task 2: Frontend Foundation and UI Primitives

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/copy.ts`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/types/user.ts`
- Create: `frontend/src/types/upstream.ts`
- Create: `frontend/src/types/log.ts`
- Create: `frontend/src/components/ui/*.tsx`

- [ ] **Step 1: Create Vite React TypeScript app files**

Create the frontend app using Vite-compatible configuration. Configure proxy rules so `/api` and `/sub` forward to `http://localhost:3001`.

- [ ] **Step 2: Add shadcn/ui component source files**

Create Button, Card, Input, Label, Dialog, DropdownMenu, Table, Badge, Tabs, Switch, Select, Alert, Sheet, Separator, Skeleton, and Sonner wrapper components with Tailwind classes.

- [ ] **Step 3: Add API client and auth persistence**

Implement a fetch wrapper that attaches `Authorization: Bearer <token>`, handles JSON errors, and exposes login, current user, subscription, admin user, upstream, log, and settings methods.

- [ ] **Step 4: Run frontend type check**

Run: `npm --prefix frontend run typecheck`

Expected: TypeScript passes.

## Task 3: Frontend Pages and Layout

**Files:**
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/Topbar.tsx`
- Create: `frontend/src/components/subscription/SubscriptionCards.tsx`
- Create: `frontend/src/pages/login/LoginPage.tsx`
- Create: `frontend/src/pages/user/SubscriptionPage.tsx`
- Create: `frontend/src/pages/user/ProfilePage.tsx`
- Create: `frontend/src/pages/admin/DashboardPage.tsx`
- Create: `frontend/src/pages/admin/UsersPage.tsx`
- Create: `frontend/src/pages/admin/UserDetailPage.tsx`
- Create: `frontend/src/pages/admin/UserUpstreamsPage.tsx`
- Create: `frontend/src/pages/admin/LogsPage.tsx`
- Create: `frontend/src/pages/admin/SettingsPage.tsx`

- [ ] **Step 1: Implement routing and protected access**

Implement `/login`, `/user/subscription`, `/user/profile`, `/admin/dashboard`, `/admin/users`, `/admin/users/:id`, `/admin/upstreams`, `/admin/logs`, and `/admin/settings`. Redirect users by role after login.

- [ ] **Step 2: Implement Chinese login and shell UI**

Build the login page, desktop sidebar, mobile Sheet menu, topbar, logout action, and dark mode toggle. All visible text must be Simplified Chinese.

- [ ] **Step 3: Implement user subscription pages**

Build account status, generic subscription link, client-specific links, copy actions, reset-token confirmation, usage instructions, Skeleton loading, and Chinese empty/error states.

- [ ] **Step 4: Implement admin pages**

Build dashboard metrics, user table with edit/enable/disable/reset/delete/configure actions, upstream table with save/test actions, logs table, settings page, confirmation dialogs, and Toast messages.

- [ ] **Step 5: Run frontend build**

Run: `npm --prefix frontend run build`

Expected: production build succeeds.

## Task 4: Root Scripts, Integration, and Verification

**Files:**
- Create: `package.json`
- Create: `README.md`

- [ ] **Step 1: Add root scripts**

Create root scripts:

- `npm run install:all`
- `npm run dev`
- `npm run dev:backend`
- `npm run dev:frontend`
- `npm run test`
- `npm run build`

- [ ] **Step 2: Add README**

Document local startup, default accounts, routes, API behavior, and subscription test URLs in Chinese.

- [ ] **Step 3: Run full verification**

Run:

- `npm run test`
- `npm run build`
- start backend and call `GET /api/health`
- login as admin and user through API
- call `/sub/:token` and `/sub/:token/clash`

Expected: tests and builds pass, health returns OK, both test accounts authenticate, subscription endpoints return content and log access.

## Self-Review

Spec coverage:

- React, TypeScript, Vite, Tailwind, shadcn/ui component source files, and lucide-react are covered in Tasks 2 and 3.
- All required Chinese pages and routes are covered in Task 3.
- Backend API, SQLite schema, seed data, and subscription endpoints are covered in Task 1.
- Toasts, Skeleton, empty states, confirmations, copy actions, and dangerous-operation dialogs are covered in Task 3.
- Local run scripts and README are covered in Task 4.

Placeholder scan:

- No `TODO` or `TBD` placeholders are intentionally left in this plan.

Type consistency:

- Backend domain names match the design document: users, upstreams, access logs, settings, clients, token, role, status.
- Frontend route names match the design document.
