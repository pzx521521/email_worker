// 本地 HTTP 调试服务:不引入第三方依赖,直接复用 Worker 的 fetch 处理器
// 用法: pnpm server (token 放在 .dev.vars 或环境变量里)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取 .dev.vars(可选),格式与 wrangler 一致: KEY=VALUE
function loadDevVars() {
  try {
    const content = readFileSync(join(__dirname, '../.dev.vars'), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .dev.vars 不存在时忽略,继续用进程环境变量
  }
}

loadDevVars();

const { default: worker } = await import(join(__dirname, '../src/index.js'));

const env = {
  UPSTASH_REDIS_REST_URL:
    process.env.UPSTASH_REDIS_REST_URL || 'https://modern-baboon-27609.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

if (!env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('缺少 UPSTASH_REDIS_REST_TOKEN,请在 .dev.vars 或环境变量中设置');
  process.exit(1);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  try {
    const body = await readBody(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        headers.append(key, item);
      }
    }

    const workerRequest = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const workerResponse = await worker.fetch(workerRequest, env);

    res.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers));
    res.end(Buffer.from(await workerResponse.arrayBuffer()));
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
