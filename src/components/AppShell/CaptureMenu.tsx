/**
 * The phone tab bar's one button: + opens the four ways in, stacked above the
 * thumb. Record sits closest to it and is the one in black; reading upwards it
 * goes Record, Write, Photos, Vibe.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Clapperboard, Mic, PenLine, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCapture } from '@/components/Capture/CaptureProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  /** Collection to save into (defaults to Moments). */
  collectionId?: string;
}

type Action = 'vibe' | 'photos' | 'write' | 'record';

const ACTIONS: { key: Action; label: string; hint: string; icon: typeof Mic }[] = [
  { key: 'vibe', label: 'Vibe', hint: 'A few seconds of today', icon: Clapperboard },
  { key: 'photos', label: 'Photos', hint: 'From your camera roll', icon: Camera },
  { key: 'write', label: 'Write', hint: 'A blank page', icon: PenLine },
  { key: 'record', label: 'Record', hint: 'Just start talking', icon: Mic },
];

export default function CaptureMenu({ collectionId }: Props) {
  const capture = useCapture();
  const [open, setOpen] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const picked = useRef(false);

  const run = (action: Action) => {
    picked.current = true;
    // Synchronous, so Photos still counts as a tap and can open the picker.
    capture[action](collectionId);
  };

  return (
    <>
      {open &&
        // Dims the page (under the tab bar) and swallows the tap that closes the
        // menu, so it can't land on a memory underneath. Portalled: the tab bar's
        // backdrop-blur would otherwise trap a fixed child inside the bar.
        createPortal(
          <div
            ref={backdropRef}
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-background/75 backdrop-blur-[2px] duration-200 animate-in fade-in-0 md:hidden"
          />,
          document.body,
        )}
      {/* Not modal: a capture dialog opens as this closes, and two modal layers fight over the page. */}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={open ? 'Close' : 'Add a memory'}
            className="-mt-6 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className={cn('size-8 transition-transform duration-200', open && 'rotate-45')} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="center"
          sideOffset={14}
          collisionPadding={16}
          onPointerDownOutside={(event) => {
            if (event.target === backdropRef.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            // The capture surface takes focus; don't pull it back to the +.
            if (picked.current) event.preventDefault();
            picked.current = false;
          }}
          className="w-[min(17rem,calc(100vw-2rem))] rounded-2xl p-1.5 shadow-xl"
        >
          {ACTIONS.map(({ key, label, hint, icon: Icon }) => {
            const primary = key === 'record';
            return (
              <DropdownMenuItem
                key={key}
                onSelect={() => run(key)}
                className={cn(
                  'h-14 gap-3 rounded-xl px-2.5 text-[15px]',
                  primary &&
                    'mt-1 bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    primary ? 'bg-primary-foreground/15' : 'bg-muted',
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="flex flex-col">
                  <span className="font-medium leading-tight">{label}</span>
                  <span
                    className={cn(
                      'text-xs leading-tight',
                      primary ? 'text-primary-foreground/70' : 'text-muted-foreground',
                    )}
                  >
                    {hint}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
