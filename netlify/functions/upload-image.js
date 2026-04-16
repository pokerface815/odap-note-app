const https = require('https');
const crypto = require('crypto');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Cloudinary 환경변수 없음' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: '잘못된 요청' }) }; }

  const { image, folder } = body;
  if (!image) return { statusCode: 400, headers, body: JSON.stringify({ error: '이미지 없음' }) };

  const uploadFolder = folder || 'odap-note';
  const timestamp = Math.round(Date.now() / 1000);
  const signStr = `folder=${uploadFolder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(signStr).digest('hex');

  // URL-encoded form data
  const params = [
    `file=${encodeURIComponent(image)}`,
    `api_key=${encodeURIComponent(CLOUDINARY_API_KEY)}`,
    `timestamp=${timestamp}`,
    `signature=${signature}`,
    `folder=${encodeURIComponent(uploadFolder)}`,
  ].join('&');

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: data }); }
      });
    });
    req.on('error', reject);
    req.write(params);
    req.end();
  });

  if (result.secure_url)
    return { statusCode: 200, headers, body: JSON.stringify({ url: result.secure_url }) };

  return { statusCode: 500, headers, body: JSON.stringify({ error: result.error?.message || '업로드 실패', detail: result }) };
};
