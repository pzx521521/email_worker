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

async function getKeys(url, headers) {
  const keysResponse = await fetch(`${url}/scan/0/COUNT/1000`, {
    headers: headers
  });

  if (!keysResponse.ok) {
    throw new Error(`HTTP error! status: ${keysResponse.status}`);
  }

  const keysData = await keysResponse.json();
  return keysData.result[1]; // 返回键列表
}

async function getValues(url, headers, keys) {
  const valuesResponse = await fetch(`${url}/mget/${keys.join('/')}`, {
    headers: headers
  });

  const valuesData = await valuesResponse.json();
  return valuesData.result;
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

export default {
  async email(event, env, ctx) {
    const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
    const parser = new PostalMime();
    const parsedEmail = await parser.parse(rawEmail);
    console.log("Mail subject: ", parsedEmail.subject);
    console.log("Mail message ID", parsedEmail.messageId);
    console.log("HTML version of Email: ", parsedEmail.html);
    console.log("Text version of Email: ", parsedEmail.text);
    if (parsedEmail.attachments.length == 0) {
      console.log("No attachments");
    } else {
      parsedEmail.attachments.forEach((att) => {
        console.log("Attachment: ", att.filename);
        console.log("Attachment disposition: ", att.disposition);
        console.log("Attachment mime type: ", att.mimeType);
        console.log("Attachment size: ", att.content.byteLength);
      });
    }
  },

  async fetch(request, env, ctx) {
    try {
      const headers = {
        'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      };

      // 检查是否是请求所有数据（包括值）
      const url = new URL(request.url);
      const isAllData = url.pathname === '/all';

      // 获取所有键
      const keys = await getKeys(env.UPSTASH_REDIS_REST_URL, headers);

      // 如果不是请求 /all，只返回键列表
      if (!isAllData) {
        return createResponse({ keys });
      }

      // 如果是请求 /all，获取所有值
      if (keys.length > 0) {
        const values = await getValues(env.UPSTASH_REDIS_REST_URL, headers, keys);

        // 组合键值对
        const result = keys.map((key, index) => ({
          key: key,
          value: values[index]
        }));

        return createResponse({ result });
      }

      return createResponse({ result: [] });

    } catch (error) {
      console.error('Error:', error);
      return createResponse({
        error: '处理请求时发生错误',
        message: error.message
      }, 500);
    }
  },
};