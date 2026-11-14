/** Upload rules shared by the upload route and the client. */
export const UPLOAD_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  'image/jpeg': { ext: 'jpg', maxBytes: 25 * 1024 * 1024 },
  'image/png': { ext: 'png', maxBytes: 25 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 25 * 1024 * 1024 },
  'image/gif': { ext: 'gif', maxBytes: 25 * 1024 * 1024 },
  'image/avif': { ext: 'avif', maxBytes: 25 * 1024 * 1024 },
  'image/heic': { ext: 'heic', maxBytes: 25 * 1024 * 1024 },
  'image/heif': { ext: 'heif', maxBytes: 25 * 1024 * 1024 },
  'audio/webm': { ext: 'webm', maxBytes: 95 * 1024 * 1024 },
  'audio/mp4': { ext: 'm4a', maxBytes: 95 * 1024 * 1024 },
  'audio/x-m4a': { ext: 'm4a', maxBytes: 95 * 1024 * 1024 },
  'audio/aac': { ext: 'aac', maxBytes: 95 * 1024 * 1024 },
  'audio/mpeg': { ext: 'mp3', maxBytes: 95 * 1024 * 1024 },
  'audio/ogg': { ext: 'ogg', maxBytes: 95 * 1024 * 1024 },
  'audio/wav': { ext: 'wav', maxBytes: 95 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', maxBytes: 95 * 1024 * 1024 },
  'video/webm': { ext: 'webm', maxBytes: 95 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', maxBytes: 95 * 1024 * 1024 },
};

export function baseContentType(contentType: string | null | undefined) {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

/** Parse a single-range `Range: bytes=…` header. */
export function parseRange(
  header: string | null,
): { offset: number; length?: number; suffix?: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, start, end] = match;
  if (start === '' && end === '') return null;
  if (start === '') return { offset: 0, suffix: Number(end) };
  const offset = Number(start);
  if (end === '') return { offset };
  const last = Number(end);
  if (last < offset) return null;
  return { offset, length: last - offset + 1 };
}
