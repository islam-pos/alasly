import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const encryptedBackupHeader = Buffer.from('ALASLYBK1');

const getEncryptionKey = () => {
  const configured = process.env.BACKUP_ENCRYPTION_KEY;
  if (!configured) throw new Error('BACKUP_ENCRYPTION_KEY is required for encrypted offsite backups');
  const key = /^[0-9a-fA-F]{64}$/.test(configured)
    ? Buffer.from(configured, 'hex')
    : Buffer.from(configured, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must encode exactly 32 random bytes as hex or base64');
  return key;
};

const getBucket = () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !encryptionKey) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey };
};

const createClient = () => {
  const configuration = getBucket();
  if (!configuration) return null;
  return {
    bucket: configuration.bucket,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
      forcePathStyle: true,
    }),
  };
};

const readObjectBody = async (body: unknown) => {
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)) {
    throw new Error('تعذر قراءة ملف النسخة من مخزن R2');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const encryptArchive = async (archivePath: string) => {
  const archive = await fs.readFile(archivePath);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([encryptedBackupHeader, nonce, cipher.getAuthTag(), ciphertext]);
};

const decryptArchive = (encrypted: Buffer) => {
  const minimumLength = encryptedBackupHeader.length + 12 + 16;
  if (encrypted.length < minimumLength || !encrypted.subarray(0, encryptedBackupHeader.length).equals(encryptedBackupHeader)) {
    throw new Error('النسخة المستعادة من R2 لا تحتوي على ترويسة تشفير معروفة');
  }
  const nonceStart = encryptedBackupHeader.length;
  const tagStart = nonceStart + 12;
  const ciphertextStart = tagStart + 16;
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), encrypted.subarray(nonceStart, tagStart));
  decipher.setAuthTag(encrypted.subarray(tagStart, ciphertextStart));
  return Buffer.concat([decipher.update(encrypted.subarray(ciphertextStart)), decipher.final()]);
};

export const getOffsiteBackupStatus = () => {
  let configuration: ReturnType<typeof getBucket> = null;
  let configurationError: string | null = null;
  try {
    configuration = getBucket();
    if (configuration) getEncryptionKey();
  } catch (error) {
    configurationError = error instanceof Error ? error.message : 'مفتاح تشفير النسخ غير صالح';
  }
  return {
    configured: Boolean(configuration) && !configurationError,
    provider: 'Cloudflare R2',
    bucket: configuration?.bucket || null,
    encrypted: Boolean(configuration) && !configurationError,
    configurationError,
  };
};

export const getOffsiteStatus = async () => ({
  ...getOffsiteBackupStatus(),
  backups: await listOffsiteBackups(),
});

export const uploadOffsiteBackup = async (id: string, archivePath: string) => {
  const configured = createClient();
  if (!configured) return { status: 'NOT_CONFIGURED' as const, remoteKey: null };
  const object = await encryptArchive(archivePath);
  await configured.client.send(new PutObjectCommand({
    Bucket: configured.bucket,
    Key: `alasly/backups/${id}.enc`,
    Body: object,
    ContentType: 'application/octet-stream',
    Metadata: { 'backup-format': 'alasly-aes-256-gcm-v1', 'source-name': id },
  }));
  return { status: 'SYNCED' as const, remoteKey: `alasly/backups/${id}.enc` };
};

export const downloadOffsiteBackup = async (id: string, archivePath: string) => {
  const configured = createClient();
  if (!configured) throw new Error('لم يتم إعداد Cloudflare R2 أو مفتاح تشفير النسخ');
  const remoteKey = `alasly/backups/${id}.enc`;
  const result = await configured.client.send(new GetObjectCommand({
    Bucket: configured.bucket,
    Key: remoteKey,
  }));
  const encrypted = await readObjectBody(result.Body);
  const archive = decryptArchive(encrypted);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, archive, { flag: 'wx' });
  return { id, remoteKey, sizeBytes: archive.length };
};

export const listOffsiteBackups = async () => {
  const configured = createClient();
  if (!configured) return [];
  const objects: Array<{ id: string; date: string; sizeBytes: number; offsiteStatus: string }> = [];
  let continuationToken: string | undefined;
  do {
    const page = await configured.client.send(new ListObjectsV2Command({
      Bucket: configured.bucket,
      Prefix: 'alasly/backups/autocare-',
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents || []) {
      const name = object.Key?.split('/').pop() || '';
      if (!name.endsWith('.tar.gz.enc')) continue;
      const id = name.slice(0, -'.enc'.length);
      objects.push({
        id,
        date: object.LastModified?.toISOString() || new Date(0).toISOString(),
        sizeBytes: object.Size || 0,
        offsiteStatus: 'SYNCED',
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects.sort((a, b) => b.date.localeCompare(a.date));
};

export const verifyOffsiteBackupConfiguration = async () => {
  const configured = createClient();
  if (!configured) throw new Error('ضبط R2_ACCOUNT_ID وR2_BUCKET وR2_ACCESS_KEY_ID وR2_SECRET_ACCESS_KEY وBACKUP_ENCRYPTION_KEY أولاً');
  await configured.client.send(new ListObjectsV2Command({
    Bucket: configured.bucket,
    Prefix: 'alasly/backups/',
    MaxKeys: 1,
  }));
  return getOffsiteBackupStatus();
};
