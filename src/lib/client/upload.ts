/**
 * Upload one file to /api/media/upload with progress. Uses XHR because fetch
 * can't report upload progress, and a progress bar matters on a slow phone.
 */
export interface UploadResult {
  key: string;
  contentType: string;
  size: number;
}

/** `status` is the HTTP status, or 0 when the request never reached the server. */
export class UploadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

export function uploadFile(
  file: Blob,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as (UploadResult & { error?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.key) {
        onProgress?.(1);
        resolve(body);
      } else {
        reject(new UploadError(body?.error ?? `Upload failed (${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new UploadError('Upload failed — check your connection', 0));
    xhr.ontimeout = () => reject(new UploadError('Upload timed out — check your connection', 0));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Upload several files one at a time, reporting overall progress. */
export async function uploadAll(
  files: Blob[],
  onProgress?: (fraction: number) => void,
): Promise<UploadResult[]> {
  const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
  let done = 0;
  const results: UploadResult[] = [];
  for (const file of files) {
    results.push(
      await uploadFile(file, {
        onProgress: (fraction) => onProgress?.((done + fraction * file.size) / total),
      }),
    );
    done += file.size;
  }
  onProgress?.(1);
  return results;
}
