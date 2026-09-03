const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = (() => {
  try { return require('@aws-sdk/s3-presigner'); } catch { return {}; }
})();
const { getR2Client } = require('../config/r2');

async function uploadToR2(buffer, key, contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const r2 = getR2Client();
  if (!r2) {
    console.warn('[r2] R2 not configured, skipping upload for', key);
    return null;
  }
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    console.warn('[r2] R2_BUCKET not set');
    return null;
  }
  await r2.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) return `${publicUrl.replace(/\/$/, '')}/${key}`;
  return `r2://${bucket}/${key}`;
}

async function getSignedR2Url(key, expiresIn = 3600) {
  const r2 = getR2Client();
  if (!r2 || !getSignedUrl) return null;
  const bucket = process.env.R2_BUCKET;
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

module.exports = { uploadToR2, getSignedR2Url };
