import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as presignUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.CLOUDFLARE_R2_REGION || 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY || '',
  },
});

export async function upload(key: string, body: Buffer, contentType: string) {
  // sanitize path traversal
  const sanitizedKey = key.replace(/\.\.\//g, '').replace(/^\/+/, '');

  const command = new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET || 'akewtutor',
    Key: sanitizedKey,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return { storageKey: sanitizedKey };
}

export async function getSignedUrl(key: string, expiresIn: number) {
  const sanitizedKey = key.replace(/\.\.\//g, '').replace(/^\/+/, '');
  const command = new GetObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET || 'akewtutor',
    Key: sanitizedKey,
  });

  return presignUrl(s3Client, command, { expiresIn });
}
