---
name: email-worker
description: >
  使用 Cloudflare 临时邮箱服务做注册/登录验证码抓取。
---

# Cloudflare email-worker 临时邮箱

Cloudflare Email Worker：收信 → 解析 → 写入 Upstash Redis（TTL 15 分钟）→ 可选转发 QQ。  
面向 **注册/登录验证码自动化**。

## 如何时使用
- 自动化流程需要一次性邮箱收验证码
- 需要 `nf_` 前缀邮箱（只入库、不转发 QQ）
- 需要按收件地址 pattern 查信或提取 N 位数字验证码


## 如何创建邮箱

任意本地部分 `@` 支持域名即可。为减少碰撞，可用时间戳/随机串。

**Go：**

```go
"nf_" + strconv.FormatUint(uint64(time.Now().UnixNano()), 36) + "@pzx.kdns.fr"
```

**通用：** 任意唯一字符串 + 域名，例如 `nf_a1b2c3d4@pzx.kdns.fr`。

### `nf_` 前缀

| 前缀 | 行为 |
|------|------|
| `nf_...` | 只写入 Redis，**不转发** QQ |
| 其它 | 入库并转发到配置的 QQ |

自动化默认用 `nf_`，避免 QQ 被验证码刷屏。

默认示例：`nf_xxxxxxx@pzx.kdns.fr`

## 如何收取邮件

```bash
curl 'https://eamil.parap.dpdns.org/all?pattern=*test1@pzx.kdns.fr*'
```

响应示例：

```json
{
  "result": [
    {
      "key": "\"SpaceXAI\" <noreply@x.ai>|test1@pzx.kdns.fr|test1@pzx.kdns.fr",
      "value": "{\"subject\":\"SpaceXAI confirmation code: HU3-Z23\",\"content\":\"邮件正文...\"}"
    }
  ]
}
```

## 支持域名

```
acode.ccwu.cc
db2.kdns.fr
p2ix.eu.cc
paa.cc.cd
para.de5.net
para.indevs.in
parap.de5.net
parap.dpdns.org
parap.eu.cc
parap.ggff.net
para.us.ci
pzix.eu.cc
pzix.qzz.io
pzx.cc.cd
pzx.de5.net
pzx.indevs.in
pzx.kdns.fr
pzx.us.ci
worksp.ccwu.cc
```
