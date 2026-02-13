import PostalMime from "postal-mime";

async function streamToArrayBuffer(stream, streamSize) {
  let result = new Uint8Array(streamSize);
  let bytesRead = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result.set(value, bytesRead);
    bytesRead += value.length;
  }
  return result;
}

async function getKeys(url, headers, pattern = null) {
  const scanUrl = pattern
    ? `${url}/scan/0/MATCH/${encodeURIComponent(pattern)}/COUNT/1000`
    : `${url}/scan/0/COUNT/1000`;
  const keysResponse = await fetch(scanUrl, {
    headers: headers
  });

  if (!keysResponse.ok) {
    throw new Error(`HTTP error! status: ${keysResponse.status}`);
  }

  const keysData = await keysResponse.json();
  //[ cursor, keys ]
  return keysData.result[1]; // 返回键列表
}

async function getValues(url, headers, keys) {
  const valuesResponse = await fetch(`${url}/mget/${keys.join('/')}`, {
    headers: headers
  });

  const valuesData = await valuesResponse.json();
  return valuesData.result;
}
function createResponseText(data, status = 200) {
  return new Response(data, {
    status,
    headers: {
      'content-type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
function createResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 创建Redis请求头
function createRedisHeaders(env) {
  return {
    'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// 获取键值对列表
async function getKeyValuePairs(env, pattern = null) {
  const headers = createRedisHeaders(env);
  const keys = await getKeys(env.UPSTASH_REDIS_REST_URL, headers, pattern);

  if (keys.length === 0) {
    return [];
  }

  const values = await getValues(env.UPSTASH_REDIS_REST_URL, headers, keys);
  return keys.map((key, index) => ({
    key: key,
    value: values[index]
  }));
}

// 路由: GET /
// 返回所有键列表，支持pattern过滤
async function handleGetKeys(env, pattern = null) {
  const headers = createRedisHeaders(env);
  const keys = await getKeys(env.UPSTASH_REDIS_REST_URL, headers, pattern);
  return createResponse({ keys });
}

// 路由: GET /all
// 返回所有键值对，支持pattern过滤
async function handleGetAll(env, pattern = null) {
  const result = await getKeyValuePairs(env, pattern);
  return createResponse({ result });
}

// 路由: GET /all/:digitFilter
// 返回匹配指定位数数字的第一个结果，支持pattern过滤
async function handleGetAllWithDigitFilter(env, digitFilter, pattern = null) {
  const result = await getKeyValuePairs(env, pattern);

  if (result.length === 0) {
    return createResponseText('');
  }

  const digitLength = parseInt(digitFilter);
  const regex = new RegExp(`\\b\\d{${digitLength}}\\b`);

  const filteredResult = result.find(item => {
    try {
      const content = JSON.parse(item.value).content.replace(/\s+/g, '');
      return regex.test(content);
    } catch {
      return false;
    }
  });

  if (filteredResult) {
    const content = JSON.parse(filteredResult.value).content.replace(/\s+/g, '');
    const match = content.match(regex);
    return createResponseText(match ? match[0] : '');
  }

  return createResponseText('');
}

export default {
  async email(message, env) {
    const headers = createRedisHeaders(env);
    const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
    const parser = new PostalMime();
    const parsedEmail = await parser.parse(rawEmail);

    const { to } = message;
    const headerFrom = message.headers.get("from");
    const subject = message.headers.get("subject");
    const redisKey = `${headerFrom}|${to}`;
    const ttl = 60 * 15;

    let content = parsedEmail.text ? parsedEmail.text : parsedEmail.html;
    content = content.replace(/\u0000+/g, "");

    const body = { "subject": subject, "content": content };
    await fetch(`${env.UPSTASH_REDIS_REST_URL}/set/${redisKey}?ex=${ttl}`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    console.log(body);
    await message.forward("pzx521521@qq.com");
  },

  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // 获取 pattern 参数（如果存在）
      const pattern = url.searchParams.get('pattern');

      // 路由: GET /all/:digitFilter?pattern=xxx
      if (pathParts[0] === 'all' && pathParts[1]) {
        return await handleGetAllWithDigitFilter(env, pathParts[1], pattern);
      }

      // 路由: GET /all?pattern=xxx
      if (pathParts[0] === 'all') {
        return await handleGetAll(env, pattern);
      }

      // 路由: GET /?pattern=xxx
      return await handleGetKeys(env, pattern);

    } catch (error) {
      console.error('Error:', error);
      return createResponse({
        error: '处理请求时发生错误',
        message: error.message
      }, 500);
    }
  },
};

// 为了支持 CommonJS require
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { default: exports.default };
}