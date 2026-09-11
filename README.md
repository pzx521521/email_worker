# email_worker

Cloudflare Email Worker：接收邮件 → 解析正文 → 写入 Upstash Redis → 可选转发。  
主要场景：**注册/登录验证码自动抓取**。

## 架构

```
外部服务发验证码邮件
        │
        ▼
Cloudflare Email Routing  →  Worker email()
        │                        │
        │                        ├─ PostalMime 解析
        │                        ├─ Redis SET（TTL 15 分钟）
        │                        └─ 非 nf_ 地址 → 转发 QQ
        ▼
HTTP fetch() 查询 Redis（keys / all / 按位数提取验证码）
```

## 功能

| 能力 | 说明 |
|------|------|
| 收信入库 | `email()` 解析邮件，写入 Redis |
| 查询 keys | `GET /` 列出 Redis 键 |
| 查询全文 | `GET /all` 返回键值对 |
| 提取验证码 | `GET /all/:位数` 从正文提取 N 位数字 |
| pattern 过滤 | 所有接口支持 `?pattern=`（Redis SCAN MATCH） |
| 选择性转发 | 收件地址以 `nf_` 开头时**不转发**到 QQ |

## 环境变量

| 名称 | 类型 | 说明 |
|------|------|------|
| `UPSTASH_REDIS_REST_URL` | vars | Upstash REST URL（已在 `wrangler.toml`） |
| `UPSTASH_REDIS_REST_TOKEN` | secret | Upstash REST Token，**必须用 secret 配置** |

```bash
# 设置 Redis Token（不要写进仓库）
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

## Redis 存储约定

- **Key**：`{From头}|{message.to}|{To头}`
  - 例：`Service <noreply@x.com>|user@yourdomain.com|user@yourdomain.com`
- **Value**（JSON 字符串）：
  ```json
  { "subject": "验证码", "content": "您的验证码是 123456 ..." }
  ```
- **TTL**：`900` 秒（15 分钟）

## HTTP API

部署后访问 Worker URL（或绑定自定义域名）。

### `GET /`

列出 keys。

```bash
curl 'https://<worker-host>/'
curl 'https://<worker-host>/?pattern=*gmail*'
```

响应：

```json
{ "keys": ["from|to|headerTo", "..."] }
```

### `GET /all`

获取到邮件内容, `pattern`支持通配符`*`,一般填写为`*邮箱*`进行过滤

```bash
curl 'https://<worker-host>/all?pattern=*nf_user@yourdomain.com*'
```

响应：

```json
{
  "result": [
    {
      "key": "from|to|headerTo",
      "value": "{\"subject\":\"...\",\"content\":\"...\"}"
    }
  ]
}
```

### `GET /all/:digitFilter`（验证码快捷接口）

在匹配结果中找**第一条**正文里含「恰好 N 位数字」的邮件，返回纯文本验证码。

```bash
# 取 6 位验证码，且 key 匹配某个收件地址
curl 'https://<worker-host>/all/6?pattern=*user@yourdomain.com*'
```

- 成功：响应 body 为验证码字符串，如 `123456`
- 未找到：空字符串
- 尽量不要使用 `GET /all/:digitFilter`,因为验证码不一定是纯数字,并且6位数字有可能找到多组,推荐使用`GET /all?pattern=xxx`获取邮件后自行查找

## 收信与转发规则

1. Cloudflare Email Routing 把指定域名/地址路由到本 Worker。
2. Worker 解析后写入 Redis。
3. 若 `message.to` 或 `To` 头以 `nf_` 开头（不区分大小写）→ **只入库，不转发**。
4. 其他地址 → 转发到 `pzx521521@qq.com`。

`nf_` 用途示例：自动化账号用 `nf_xxx@yourdomain.com`，避免 QQ 邮箱被验证码刷屏。

## 本地开发

```bash
pnpm install   # 或 npm install

# Cloudflare 本地 dev（需登录 wrangler，secret 可用 .dev.vars）
pnpm dev

# 简易 Express 包装（仅测 fetch 路由，不测 email 入口）
pnpm server    # http://localhost:3000
```

`.dev.vars` 示例（勿提交 git）：

```
UPSTASH_REDIS_REST_TOKEN=你的token
```

> 注意：`scripts/server.js` 内若硬编码了 token，仅适合本机调试；生产务必用 `wrangler secret`。

## 部署

```bash
pnpm publish
# 等价：npx wrangler publish
```

### Email Routing 配置（Dashboard 或 CLI）

1. 域名接入 Cloudflare，开启 **Email Routing**。
2. 添加 Catch-all 或具体地址规则，目标选 **Send to a Worker** → `email-worker`。
3. 确认 Worker 已绑定 `email()` 处理器（本仓库已实现）。

## 项目结构

```
email_worker/
├── src/index.js        # Worker：email() + fetch()
├── scripts/server.js   # 本地 Express 调试 HTTP 接口
├── wrangler.toml       # Worker 配置
├── package.json
└── README.md
```

## 常见问题

| 问题 | 处理 |
|------|------|
| 查不到邮件 | 确认 Email Routing 已指向本 Worker；Redis TTL 仅 15 分钟 |
| 验证码接口返回空 | 位数不对、pattern 过严、正文无整词 N 位数字、邮件尚未到达 |
| pattern 语法 | 走 Redis `SCAN MATCH`，如 `*@example.com*`、`*nf_*` |
| 不想转发到 QQ | 使用 `nf_` 前缀收件地址 |
| CORS | 接口已返回 `Access-Control-Allow-Origin: *`，可浏览器直调 |

## 安全提醒

- **不要**把 `UPSTASH_REDIS_REST_TOKEN` 提交到 git。
- 公开 Worker URL 等于公开读邮箱内容缓存；生产建议加鉴权（Header Token / Cloudflare Access）。
- 本服务面向个人验证码自动化，勿用于未授权邮箱拦截。
