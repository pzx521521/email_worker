import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 导入 worker
const workerPath = join(__dirname, '../src/index.js');
const { default: worker } = await import(workerPath);

const app = express();

app.all('*', async (req, res) => {
    try {
        // 构造 Worker Request 对象
        const workerRequest = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers,
            body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
        });
        const env = {
            UPSTASH_REDIS_REST_URL: 'https://modern-baboon-27609.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: ''
        }
        // 调用 Worker 的 fetch 处理函数
        const workerResponse = await worker.fetch(workerRequest, env);

        // 获取响应数据
        const data = await workerResponse.json();

        // 发送响应
        res.status(workerResponse.status).json(data);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});