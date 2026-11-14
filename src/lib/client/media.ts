/**
 * Prepare photos and videos in the browser before upload: shrink big phone
 * photos (a 4 MB photo becomes ~500 KB and loads instantly in the feed), read
 * when the photo was taken, and measure videos.
 */
export interface PreparedFile {
  blob: Blob;
  kind: 'image' | 'video';
  width?: number;
  height?: number;
  durationMs?: number;
  takenAt?: Date;
  previewUrl: string;
}

const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.86;

async function readTakenAt(file: File): Promise<Date | undefined> {
  try {
    const ExifReader = (await import('exifreader')).default;
    const tags = await ExifReader.load(file);
    const raw = (tags.DateTimeOriginal ?? tags.DateTime)?.description;
    if (!raw) return undefined;
    // "2024:06:01 14:03:22" (local time, no zone)
    const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!match) return undefined;
    const [, y, mo, d, h, mi, s] = match.map(Number);
    const date = new Date(y, mo - 1, d, h, mi, s);
    return Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86_400_000
      ? undefined
      : date;
  } catch {
    return undefined;
  }
}

async function prepareImage(file: File): Promise<PreparedFile> {
  const takenAt = await readTakenAt(file);
  // Keep GIFs (animation) and anything the browser can't decode as-is.
  if (file.type === 'image/gif') {
    return { blob: file, kind: 'image', takenAt, previewUrl: URL.createObjectURL(file) };
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    const usable = blob && blob.size < file.size ? blob : file;
    return {
      blob: usable,
      kind: 'image',
      width,
      height,
      takenAt,
      previewUrl: URL.createObjectURL(usable),
    };
  } catch {
    return { blob: file, kind: 'image', takenAt, previewUrl: URL.createObjectURL(file) };
  }
}

function prepareVideo(file: File): Promise<PreparedFile> {
  const previewUrl = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const done = () =>
      resolve({
        blob: file,
        kind: 'video',
        previewUrl,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
        takenAt: file.lastModified ? new Date(file.lastModified) : undefined,
      });
    video.onloadedmetadata = done;
    video.onerror = done;
    video.src = previewUrl;
  });
}

export function prepareFile(file: File): Promise<PreparedFile> {
  return file.type.startsWith('video/') ? prepareVideo(file) : prepareImage(file);
}

/** Pick the best MediaRecorder format this browser supports. */
export function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
