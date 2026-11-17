import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';

export type ObjectStorage = {
  kind: 'local' | 'r2';
  presignPut?(key: string, contentType: string): Promise<{ url: string; headers: Record<string, string> }>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
};

const KEY = /^inv\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

function assertKey(key: string) {
  if (!KEY.test(key)) throw new Error('bad storage key');
}

export function createStorage(config: Config): ObjectStorage {
  if (config.r2) return new R2Storage(config.r2);
  return new LocalStorage(config.dataDir);
}

class LocalStorage implements ObjectStorage {
  kind = 'local' as const;

  constructor(private readonly root: string) {}

  async put(key: string, body: Buffer, _contentType: string) {
    assertKey(key);
    const file = path.join(this.root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    assertKey(key);
    try {
      return await readFile(path.join(this.root, key));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    assertKey(key);
    await rm(path.join(this.root, key), { force: true });
  }

  async deletePrefix(prefix: string) {
    if (!prefix.startsWith('inv/') || prefix.includes('..')) return;
    await rm(path.join(this.root, prefix), { recursive: true, force: true });
  }
}

class R2Storage implements ObjectStorage {
  kind = 'r2' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: NonNullable<Config['r2']>) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async presignPut(key: string, contentType: string) {
    assertKey(key);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.client, command, { expiresIn: 900 });
    return { url, headers: { 'Content-Type': contentType } };
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    assertKey(key);
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) return null;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string) {
    if (!prefix.startsWith('inv/')) return;
    const listed = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
    for (const item of listed.Contents ?? []) {
      if (item.Key) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: item.Key }));
    }
  }
}

export async function listLocalFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const nested = await readdir(full);
        if (nested) await walk(full);
      } catch {
        found.push(full);
      }
    }
  }
  await walk(root);
  return found;
}
