import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as presignUrl } from '@aws-sdk/s3-request-presigner';

function resolveRegion(): string {
  if (process.env.STORAGE_REGION) return process.env.STORAGE_REGION;
  // Backblaze B2 endpoints look like https://s3.us-west-004.backblazeb2.com
  const m = process.env.STORAGE_ENDPOINT?.match(/^https?:\/\/s3\.([^.]+)\./);
  return m?.[1] ?? 'us-east-1';
}

const s3Client = new S3Client({
  region: resolveRegion(),
  endpoint: process.env.STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || '',
  },
});

export async function upload(key: string, body: Buffer, contentType: string) {
  // sanitize path traversal
  const sanitizedKey = key.replace(/\.\.\//g, '').replace(/^\/+/, '');

  const command = new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET || 'akewtutor',
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
    Bucket: process.env.STORAGE_BUCKET || 'akewtutor',
    Key: sanitizedKey,
  });

  return presignUrl(s3Client, command, { expiresIn });
}
