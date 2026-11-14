/**
 * Private media storage.
 *
 * - Cloudflare: the `MEDIA` R2 binding (no credentials needed).
 * - Node: any S3-compatible bucket via S3_* env vars (R2's S3 API, AWS S3, MinIO).
 *
 * Objects are never public. They're served through /api/media/[id] after an
 * access check, so revoking someone's membership revokes their access.
 */
import { AwsClient } from 'aws4fetch';
import { getEnvVar, tryGetCloudflareEnv } from '@/lib/server/cloudflare';

export interface StoredObject {
  body: ReadableStream;
  size: number;
  contentType: string;
  etag: string;
  /** Present when a range was requested and satisfied. */
  range?: { offset: number; length: number };
}

export interface ByteRange {
  offset: number;
  length?: number;
  suffix?: number;
}

export interface Storage {
  put(
    key: string,
    body: ReadableStream | ArrayBuffer,
    contentType: string,
    size: number,
  ): Promise<void>;
  get(key: string, range?: ByteRange): Promise<StoredObject | null>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
  /**
   * Soft delete: move objects under `trash/`, where a bucket lifecycle rule
   * removes them after 30 days. Lets us recover from accidental deletes.
   */
  trash(keys: string[]): Promise<void>;
  /** Read a whole object into memory (transcription). */
  read(key: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null>;
}

export const TRASH_PREFIX = 'trash/';

/** Copy each object to trash/<key>, then delete the original. */
async function moveToTrash(storage: Pick<Storage, 'get' | 'put' | 'delete'>, keys: string[]) {
  for (const key of keys) {
    if (key.startsWith(TRASH_PREFIX)) continue;
    const object = await storage.get(key);
    if (!object) continue;
    await storage.put(`${TRASH_PREFIX}${key}`, object.body, object.contentType, object.size);
    await storage.delete([key]);
  }
}

function r2Storage(bucket: R2Bucket): Storage {
  const storage: Storage = {
    async put(key, body, contentType, size) {
      // On Workers, stream straight through (R2 needs a known length). Under
      // `next dev` the binding is a Node proxy without FixedLengthStream.
      const value =
        body instanceof ArrayBuffer
          ? body
          : typeof FixedLengthStream !== 'undefined'
            ? body.pipeThrough(new FixedLengthStream(size))
            : await new Response(body).arrayBuffer();
      await bucket.put(key, value, { httpMetadata: { contentType } });
    },
    async get(key, range) {
      const object = await bucket.get(key, range ? { range: toR2Range(range) } : undefined);
      if (!object || !('body' in object)) return null;
      const r = object.range as { offset?: number; length?: number } | undefined;
      return {
        body: object.body,
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: object.httpEtag,
        range:
          range && r && typeof r.offset === 'number'
            ? { offset: r.offset, length: r.length ?? object.size - r.offset }
            : undefined,
      };
    },
    async head(key) {
      const object = await bucket.head(key);
      if (!object) return null;
      return {
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    },
    async delete(keys) {
      if (keys.length) await bucket.delete(keys);
    },
    async read(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        bytes: await object.arrayBuffer(),
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    },
    trash: (keys) => moveToTrash(storage, keys),
  };
  return storage;
}

function toR2Range(range: ByteRange): R2Range {
  if (range.suffix !== undefined) return { suffix: range.suffix };
  return range.length !== undefined
    ? { offset: range.offset, length: range.length }
    : { offset: range.offset };
}

function s3Storage(config: {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Storage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: 's3',
  });
  const url = (key: string) =>
    `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  const storage: Storage = {
    async put(key, body, contentType, size) {
      const bytes = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
      const res = await client.fetch(url(key), {
        method: 'PUT',
        body: bytes,
        headers: { 'Content-Type': contentType, 'Content-Length': String(size) },
      });
      if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
    },
    async get(key, range) {
      const headers: Record<string, string> = {};
      if (range) {
        headers.Range =
          range.suffix !== undefined
            ? `bytes=-${range.suffix}`
            : `bytes=${range.offset}-${range.length !== undefined ? range.offset + range.length - 1 : ''}`;
      }
      const res = await client.fetch(url(key), { headers });
      if (res.status === 404) return null;
      if (!res.ok || !res.body) throw new Error(`Storage read failed (${res.status})`);
      const contentRange = res.headers.get('Content-Range'); // bytes 0-99/1234
      const match = contentRange?.match(/bytes (\d+)-(\d+)\/(\d+)/);
      return {
        body: res.body,
        size: match ? Number(match[3]) : Number(res.headers.get('Content-Length') ?? 0),
        contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
        etag: res.headers.get('ETag') ?? '',
        range: match
          ? { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 }
          : undefined,
      };
    },
    async head(key) {
      const res = await client.fetch(url(key), { method: 'HEAD' });
      if (!res.ok) return null;
      return {
        size: Number(res.headers.get('Content-Length') ?? 0),
        contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
      };
    },
    async delete(keys) {
      await Promise.all(keys.map((key) => client.fetch(url(key), { method: 'DELETE' })));
    },
    async read(key) {
      const res = await client.fetch(url(key));
      if (!res.ok) return null;
      return {
        bytes: await res.arrayBuffer(),
        contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
      };
    },
    trash: (keys) => moveToTrash(storage, keys),
  };
  return storage;
}

export function getStorage(): Storage | null {
  const bucket = tryGetCloudflareEnv()?.MEDIA;
  if (bucket) return r2Storage(bucket);

  const endpoint = getEnvVar('S3_ENDPOINT');
  const bucketName = getEnvVar('S3_BUCKET');
  const accessKeyId = getEnvVar('S3_ACCESS_KEY_ID');
  const secretAccessKey = getEnvVar('S3_SECRET_ACCESS_KEY');
  if (endpoint && bucketName && accessKeyId && secretAccessKey) {
    return s3Storage({
      endpoint,
      bucket: bucketName,
      region: getEnvVar('S3_REGION') ?? 'auto',
      accessKeyId,
      secretAccessKey,
    });
  }
  return null;
}

/** Keys are always generated server-side under the uploader's prefix. */
export function userKeyPrefix(userId: string) {
  return `u/${userId}/`;
}
