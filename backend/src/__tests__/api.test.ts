import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createStore } from "../db.js";

let tempDir = "";
let dbPath = "";
let apps: Express[] = [];
let servers: http.Server[] = [];

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sublink-test-"));
  dbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  for (const server of servers) {
    server.close();
  }
  servers = [];
  for (const app of apps) {
    app.locals.store?.db.close();
  }
  apps = [];
  fs.rmSync(tempDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
});

async function login(username: string, password: string) {
  const app = await createApp({ dbPath, jwtSecret: "test-secret" });
  apps.push(app);
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password });

  return { app, response, token: response.body.token as string };
}

async function startUpstreamServer() {
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("subscription-userinfo", "upload=1024; download=2048; total=107374182400; expire=4102444799");
    res.setHeader("profile-update-interval", "24");
    res.end("proxies: []\n");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("上游测试服务启动失败");
  return `http://127.0.0.1:${address.port}/sub`;
}

async function startInspectingUpstreamServer() {
  let userAgent = "";
  const server = http.createServer((req, res) => {
    userAgent = req.headers["user-agent"] || "";
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("subscription-userinfo", "upload=4096; download=8192; total=214748364800; expire=4102444799");
    res.end("proxies: []\n");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("上游测试服务启动失败");
  return {
    url: `http://127.0.0.1:${address.port}/sub`,
    getUserAgent: () => userAgent
  };
}

describe("SubLink backend API", () => {
  it("允许管理员使用默认账号登录", async () => {
    const { response } = await login("admin", "admin123");

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      username: "admin",
      role: "admin",
      status: "active"
    });
  });

  it("使用错误密码登录时返回中文错误", async () => {
    const { response } = await login("admin", "wrong-password");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("账号或密码错误");
  });

  it("携带登录 Token 可以读取当前用户资料", async () => {
    const { app, token } = await login("user", "user123");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      username: "user",
      role: "user"
    });
  });

  it("普通用户可以读取订阅信息并重置 Token", async () => {
    const { app, token } = await login("user", "user123");

    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(subscription.status).toBe(200);
    expect(subscription.body.user.username).toBe("user");
    expect(subscription.body.genericLink).toContain("/sub/");
    expect(subscription.body.clientLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ client: "clash", name: "Clash", enabled: true })
      ])
    );

    const oldToken = subscription.body.user.token;
    const reset = await request(app)
      .post("/api/user/reset-token")
      .set("Authorization", `Bearer ${token}`);

    expect(reset.status).toBe(200);
    expect(reset.body.token).not.toBe(oldToken);
  });

  it("订阅访问会返回内容并写入访问日志", async () => {
    const { app, token } = await login("user", "user123");
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${token}`);
    const userToken = subscription.body.user.token;

    const sub = await request(app)
      .get(`/sub/${userToken}/clash`)
      .set("User-Agent", "Clash/Test");

    expect(sub.status).toBe(200);
    expect(sub.text).toContain("SubLink 本地测试节点");

    const admin = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    const logs = await request(app)
      .get("/api/admin/logs")
      .set("Authorization", `Bearer ${admin.body.token}`);

    expect(logs.status).toBe(200);
    expect(logs.body.items[0]).toMatchObject({
      username: "user",
      client: "clash",
      status: "success"
    });
  });

  it("管理员可以管理用户和全局上游配置", async () => {
    const { app, token } = await login("admin", "admin123");

    const users = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(users.status).toBe(200);
    const target = users.body.items.find((item: { username: string }) => item.username === "user");
    expect(target.id).toEqual(expect.any(Number));

    const disable = await request(app)
      .post(`/api/admin/users/${target.id}/disable`)
      .set("Authorization", `Bearer ${token}`);
    expect(disable.status).toBe(200);
    expect(disable.body.user.status).toBe("disabled");

    const reset = await request(app)
      .post(`/api/admin/users/${target.id}/reset-token`)
      .set("Authorization", `Bearer ${token}`);
    expect(reset.status).toBe(200);
    expect(reset.body.token).toEqual(expect.any(String));

    const upstream = await request(app)
      .put("/api/admin/upstreams/clash")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://example.com/sub", enabled: true });
    expect(upstream.status).toBe(200);
    expect(upstream.body.upstream).toMatchObject({
      client: "clash",
      url: "https://example.com/sub",
      enabled: true
    });

    const upstreams = await request(app)
      .get("/api/admin/upstreams")
      .set("Authorization", `Bearer ${token}`);
    expect(upstreams.status).toBe(200);
    expect(upstreams.body.items.find((item: { client: string }) => item.client === "clash")).toMatchObject({
      url: "https://example.com/sub",
      enabled: true
    });
  });

  it("管理员可以一次保存所有全局上游配置", async () => {
    const { app, token } = await login("admin", "admin123");

    const save = await request(app)
      .put("/api/admin/upstreams")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { client: "clash", url: "https://example.com/clash", enabled: true },
          { client: "mihomo", url: "https://example.com/mihomo", enabled: false }
        ]
      });

    expect(save.status).toBe(200);
    expect(save.body.message).toBe("保存成功");
    expect(save.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ client: "clash", url: "https://example.com/clash", enabled: true }),
        expect.objectContaining({ client: "mihomo", url: "https://example.com/mihomo", enabled: false })
      ])
    );

    const upstreams = await request(app)
      .get("/api/admin/upstreams")
      .set("Authorization", `Bearer ${token}`);

    expect(upstreams.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ client: "clash", url: "https://example.com/clash", enabled: true }),
        expect.objectContaining({ client: "mihomo", url: "https://example.com/mihomo", enabled: false })
      ])
    );
  });

  it("代理上游订阅时会保留 Clash 流量信息响应头", async () => {
    const upstreamUrl = await startUpstreamServer();
    const { app, token } = await login("admin", "admin123");

    const save = await request(app)
      .put("/api/admin/upstreams/clash")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: upstreamUrl, enabled: true });
    expect(save.status).toBe(200);

    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "user123" });
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${userLogin.body.token}`);

    const sub = await request(app).get(`/sub/${subscription.body.user.token}/clash`);

    expect(sub.status).toBe(200);
    expect(sub.text).toBe("proxies: []\n");
    expect(sub.headers["subscription-userinfo"]).toBe("upload=1024; download=2048; total=107374182400; expire=4102444799");
    expect(sub.headers["profile-update-interval"]).toBe("24");
  });

  it("通用订阅链接在默认上游为空时会回退到 Clash 上游并转发客户端 User-Agent", async () => {
    const upstream = await startInspectingUpstreamServer();
    const { app, token } = await login("admin", "admin123");

    await request(app)
      .put("/api/admin/upstreams/clash")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: upstream.url, enabled: true });

    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "user123" });
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${userLogin.body.token}`);

    const sub = await request(app)
      .get(`/sub/${subscription.body.user.token}`)
      .set("User-Agent", "ClashMetaForAndroid/2.11");

    expect(sub.status).toBe(200);
    expect(sub.headers["subscription-userinfo"]).toBe("upload=4096; download=8192; total=214748364800; expire=4102444799");
    expect(upstream.getUserAgent()).toBe("ClashMetaForAndroid/2.11");
  });

  it("直跳模式下订阅链接会重定向到上游以避免代理超时", async () => {
    const upstream = await startInspectingUpstreamServer();
    const { app, token } = await login("admin", "admin123");

    await request(app)
      .put("/api/admin/upstreams/clash")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: upstream.url, enabled: true });
    await request(app)
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ subscriptionMode: "redirect" });

    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "user123" });
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${userLogin.body.token}`);

    const sub = await request(app)
      .get(`/sub/${subscription.body.user.token}/clash`)
      .redirects(0);

    expect(sub.status).toBe(302);
    expect(sub.headers.location).toBe(upstream.url);
  });

  it("通用订阅链接会根据 User-Agent 识别访问日志客户端", async () => {
    const { app, token } = await login("user", "user123");
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${token}`);

    const sub = await request(app)
      .get(`/sub/${subscription.body.user.token}`)
      .set("User-Agent", "Mihomo/1.19.3");
    expect(sub.status).toBe(200);

    const admin = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    const logs = await request(app)
      .get("/api/admin/logs")
      .set("Authorization", `Bearer ${admin.body.token}`);

    expect(logs.body.items[0]).toMatchObject({
      username: "user",
      client: "mihomo",
      status: "success"
    });
  });

  it("通用订阅链接会区分 Clash Verge 和 ClashMetaForAndroid", async () => {
    const { app, token } = await login("user", "user123");
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${token}`);

    const verge = await request(app)
      .get(`/sub/${subscription.body.user.token}`)
      .set("User-Agent", "clash-verge/v2.5.1");
    expect(verge.status).toBe(200);

    const metaAndroid = await request(app)
      .get(`/sub/${subscription.body.user.token}`)
      .set("User-Agent", "ClashMetaForAndroid/2.11.26.Meta");
    expect(metaAndroid.status).toBe(200);

    const admin = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    const logs = await request(app)
      .get("/api/admin/logs")
      .set("Authorization", `Bearer ${admin.body.token}`);

    expect(logs.body.items[0]).toMatchObject({ client: "clashmetaforandroid" });
    expect(logs.body.items[1]).toMatchObject({ client: "clashverge" });
  });

  it("普通用户只能读取自己的访问日志", async () => {
    const { app, token: userAuthToken } = await login("user", "user123");
    const userSubscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${userAuthToken}`);
    await request(app)
      .get(`/sub/${userSubscription.body.user.token}`)
      .set("User-Agent", "Mihomo/1.19.3");

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    const adminSubscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${adminLogin.body.token}`);
    await request(app)
      .get(`/sub/${adminSubscription.body.user.token}`)
      .set("User-Agent", "clash-verge/v2.5.1");

    const ownLogs = await request(app)
      .get("/api/user/logs")
      .set("Authorization", `Bearer ${userAuthToken}`);

    expect(ownLogs.status).toBe(200);
    expect(ownLogs.body.items).toHaveLength(1);
    expect(ownLogs.body.items[0]).toMatchObject({
      username: "user",
      client: "mihomo",
      ipLocation: "本地网络"
    });
  });

  it("普通用户可以修改自己的用户名和密码", async () => {
    const { app, token } = await login("user", "user123");

    const profile = await request(app)
      .patch("/api/user/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "newuser", remark: "自己修改的备注" });
    expect(profile.status).toBe(200);
    expect(profile.body.user).toMatchObject({
      username: "newuser",
      remark: "自己修改的备注"
    });

    const password = await request(app)
      .post("/api/user/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "user123", newPassword: "newpass123" });
    expect(password.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "newuser", password: "user123" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "newuser", password: "newpass123" });
    expect(newLogin.status).toBe(200);
  });

  it("管理员访问日志会根据用户 ID 显示最新用户名", async () => {
    const { app, token } = await login("user", "user123");
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${token}`);

    await request(app)
      .get(`/sub/${subscription.body.user.token}`)
      .set("User-Agent", "Mihomo/1.19.3");

    const profile = await request(app)
      .patch("/api/user/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "renamed-user", remark: "改名后日志同步" });
    expect(profile.status).toBe(200);

    const admin = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    const logs = await request(app)
      .get("/api/admin/logs")
      .set("Authorization", `Bearer ${admin.body.token}`);

    expect(logs.body.items[0]).toMatchObject({
      user_id: subscription.body.user.id,
      username: "renamed-user"
    });
  });

  it("管理员可以修改用户密码", async () => {
    const { app, token } = await login("admin", "admin123");
    const users = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);
    const target = users.body.items.find((item: { username: string }) => item.username === "user");

    const change = await request(app)
      .post(`/api/admin/users/${target.id}/password`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "adminset123" });
    expect(change.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "user123" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "adminset123" });
    expect(newLogin.status).toBe(200);
  });

  it("管理员新增的新用户首次登录必须设置新密码", async () => {
    const { app, token } = await login("admin", "admin123");

    const create = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "first-login", password: "temp123", expiresAt: "2099-12-31T23:59:59.000Z" });
    expect(create.status).toBe(201);
    expect(create.body.user.mustChangePassword).toBe(true);

    const firstLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "first-login", password: "temp123" });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.user.mustChangePassword).toBe(true);

    const change = await request(app)
      .post("/api/user/password")
      .set("Authorization", `Bearer ${firstLogin.body.token}`)
      .send({ currentPassword: "temp123", newPassword: "private123" });
    expect(change.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "first-login", password: "temp123" });
    expect(oldLogin.status).toBe(401);

    const nextLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "first-login", password: "private123" });
    expect(nextLogin.status).toBe(200);
    expect(nextLogin.body.user.mustChangePassword).toBe(false);
  });

  it("管理员设置公网订阅地址后用户订阅链接使用该地址", async () => {
    const { app, token } = await login("admin", "admin123");

    const save = await request(app)
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ publicBaseUrl: "https://sub.example.com", siteName: "我的订阅系统" });
    expect(save.status).toBe(200);

    const publicSettings = await request(app).get("/api/public/settings");
    expect(publicSettings.status).toBe(200);
    expect(publicSettings.body.settings.siteName).toBe("我的订阅系统");

    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "user123" });
    const subscription = await request(app)
      .get("/api/user/subscription")
      .set("Authorization", `Bearer ${userLogin.body.token}`);

    expect(subscription.body.genericLink).toMatch(/^https:\/\/sub\.example\.com\/sub\//);
    expect(subscription.body.clientLinks[0].link).toMatch(/^https:\/\/sub\.example\.com\/sub\//);
  });

  it("管理员可以创建和删除公告，用户可以查看并标记已读", async () => {
    const { app, token: adminToken } = await login("admin", "admin123");
    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "user123" });

    const create = await request(app)
      .post("/api/admin/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "维护通知", content: "今晚 23:00 进行系统维护" });
    expect(create.status).toBe(201);
    expect(create.body.announcement).toMatchObject({
      title: "维护通知",
      content: "今晚 23:00 进行系统维护"
    });

    const unread = await request(app)
      .get("/api/user/announcements")
      .set("Authorization", `Bearer ${userLogin.body.token}`);
    expect(unread.status).toBe(200);
    expect(unread.body.items[0]).toMatchObject({
      id: create.body.announcement.id,
      title: "维护通知",
      isRead: false
    });

    const read = await request(app)
      .post(`/api/user/announcements/${create.body.announcement.id}/read`)
      .set("Authorization", `Bearer ${userLogin.body.token}`);
    expect(read.status).toBe(200);

    const readList = await request(app)
      .get("/api/user/announcements")
      .set("Authorization", `Bearer ${userLogin.body.token}`);
    expect(readList.body.items[0]).toMatchObject({
      id: create.body.announcement.id,
      isRead: true
    });
    expect(readList.body.items[0].readAt).toEqual(expect.any(String));

    const remove = await request(app)
      .delete(`/api/admin/announcements/${create.body.announcement.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(remove.status).toBe(200);

    const afterDelete = await request(app)
      .get("/api/user/announcements")
      .set("Authorization", `Bearer ${userLogin.body.token}`);
    expect(afterDelete.body.items).toEqual([]);
  });

  it("默认账号改名后重新初始化不会再次创建默认账号", async () => {
    const store = createStore(dbPath);
    const admin = store.findUserByUsername("admin");
    const user = store.findUserByUsername("user");
    expect(admin).toBeTruthy();
    expect(user).toBeTruthy();

    store.updateUser(admin!.id, { username: "owner" });
    store.updateOwnProfile(user!.id, { username: "member", remark: user!.remark });
    store.db.close();

    const reopened = createStore(dbPath);
    expect(reopened.findUserByUsername("admin")).toBeUndefined();
    expect(reopened.findUserByUsername("user")).toBeUndefined();
    expect(reopened.findUserByUsername("owner")?.role).toBe("admin");
    expect(reopened.findUserByUsername("member")?.role).toBe("user");
    reopened.db.close();
  });
});
