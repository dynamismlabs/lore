/**
 * Photos and videos in a memory. `preview` shows up to four tiles (feed);
 * `full` shows everything large, with tap-to-enlarge.
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Memory } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type Media = Memory['media'][number];

interface Props {
  items: Media[];
  variant?: 'preview' | 'full';
  className?: string;
}

export default function PhotoGrid({ items, variant = 'preview', className }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;

  if (variant === 'full') {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {items.map((item, index) =>
          item.kind === 'video' ? (
            <video
              key={item.id}
              src={item.url!}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-xl bg-muted"
            />
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpen(index)}
              className="block w-full"
            >
              <img
                src={item.url!}
                alt=""
                loading="lazy"
                width={item.width ?? undefined}
                height={item.height ?? undefined}
                className="h-auto w-full rounded-xl bg-muted"
              />
            </button>
          ),
        )}
        <Lightbox items={items} index={open} onChange={setOpen} />
      </div>
    );
  }

  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  return (
    <div
      className={cn(
        'grid gap-1 overflow-hidden rounded-xl',
        shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
        className,
      )}
    >
      {shown.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            'relative overflow-hidden bg-muted',
            shown.length === 1 ? 'aspect-[4/3]' : 'aspect-square',
            shown.length === 3 && index === 0 && 'row-span-2 aspect-auto',
          )}
        >
          {item.kind === 'video' ? (
            <video
              src={`${item.url}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          ) : (
            <img src={item.url!} alt="" loading="lazy" className="size-full object-cover" />
          )}
          {extra > 0 && index === shown.length - 1 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-medium text-white">
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Lightbox({
  items,
  index,
  onChange,
}: {
  items: Media[];
  index: number | null;
  onChange: (index: number | null) => void;
}) {
  const images = items.filter((i) => i.kind === 'image');
  const current = index === null ? null : items[index];
  const position = current ? images.indexOf(current) : -1;
  const go = (delta: number) => {
    const next = images[(position + delta + images.length) % images.length];
    onChange(items.indexOf(next));
  };
  return (
    <Dialog open={!!current} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent
        hideClose
        className="max-w-none border-0 bg-black p-0 sm:rounded-none"
        style={{ width: '100vw', height: '100dvh' }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(1);
          if (e.key === 'ArrowLeft') go(-1);
        }}
      >
        <DialogTitle className="sr-only">Photo</DialogTitle>
        <DialogDescription className="sr-only">Full-size photo</DialogDescription>
        {current && (
          <div
            className="relative flex h-full w-full items-center justify-center"
            onClick={() => onChange(null)}
          >
            <img src={current.url!} alt="" className="max-h-full max-w-full object-contain" />
            <button
              type="button"
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2 text-white"
              aria-label="Close"
              onClick={() => onChange(null)}
            >
              <X className="size-5" />
            </button>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 rounded-full bg-white/15 p-2 text-white"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(-1);
                  }}
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  className="absolute right-3 rounded-full bg-white/15 p-2 text-white"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(1);
                  }}
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
