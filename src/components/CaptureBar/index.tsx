/**
 * Record / Write / Photos — the three ways in, right where you are (Home,
 * between Vibes and Recent; an empty collection).
 */
import { Camera, Mic, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCapture } from '@/components/Capture/CaptureProvider';

interface Props {
  /** Where new memories go (defaults to Moments). */
  collectionId?: string;
  className?: string;
}

export default function CaptureBar({ collectionId, className }: Props) {
  const capture = useCapture();
  const secondary =
    'flex h-14 items-center justify-center gap-2 rounded-full border font-medium transition-colors hover:bg-accent active:scale-[0.98]';
  return (
    <section className={cn('grid grid-cols-[1.4fr_1fr_1fr] gap-2', className)} aria-label="Add a memory">
      <button
        type="button"
        onClick={() => capture.record(collectionId)}
        className="flex h-14 items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
      >
        <Mic className="size-5" /> Record
      </button>
      <button type="button" onClick={() => capture.write(collectionId)} className={secondary}>
        <PenLine className="size-4" /> Write
      </button>
      <button type="button" onClick={() => capture.photos(collectionId)} className={secondary}>
        <Camera className="size-4" /> Photos
      </button>
    </section>
  );
}
