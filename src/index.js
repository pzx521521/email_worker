import PostalMime from "postal-mime";

const headers = { "Authorization": "Bearer AWvZAAIjcDE3ZjlkZTlkZDZhYWY0ZmVhYTRlNzJhYzEyOTdjMDBiZHAxMA" }
const redisUrl = "https://modern-baboon-27609.upstash.io"

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

export default {
  async fetch(request, env, ctx) {
    // 使用 SCAN 命令一次性获取所有数据
    const response = await fetch(`${redisUrl}/scan/0`, {
      headers: headers
    });
    const corsHeaders = {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
    const data = await response.json();
    if (data.error) {
      return new Response(JSON.stringify(data), {
        headers: corsHeaders
      })
    }
    return new Response(JSON.stringify(data.result), {
      headers: corsHeaders
    });
  },

  async email(message, env, ctx) {
    const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
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
    const { from, to } = message;
    const subject = message.headers.get("subject")
    const redisKey = `${from}|${to}`;  // Redis 键名
    const ttl = 60 * 15;  // 设置 15 分钟的过期时间（单位：秒）
    // const headersObj = Object.fromEntries(message.headers);
    const body = { "subject": subject, "text": parsedEmail.text };  // 这是邮件正文部分
    const response = await fetch(`${redisUrl}/set/${redisKey}?ex=${ttl}`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    const resp = await response.text()
    console.log(body)
    await message.forward("pzx521521@qq.com")
  },
};