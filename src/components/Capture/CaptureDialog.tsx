/**
 * Capture surfaces. `panel`: full-screen on phones, a centered panel on larger
 * screens (recording). `page`: a full page everywhere, no backdrop — the
 * writer, so it feels like a blank page rather than a form.
 * Clicking outside / Escape goes through `onRequestClose`, which decides
 * whether to ask first (unsaved recording, picked photos) or close.
 */
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface Props {
  title: string;
  description?: string;
  onRequestClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  variant?: 'panel' | 'page';
  className?: string;
}

export default function CaptureDialog({
  title,
  description,
  onRequestClose,
  children,
  wide = false,
  variant = 'panel',
  className,
}: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onRequestClose()}>
      <DialogContent
        hideClose
        className={cn(
          'left-0 top-0 flex h-[100dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0',
          variant === 'page'
            ? 'w-screen bg-background shadow-none data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0'
            : cn(
                'sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90dvh] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border',
                wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
              ),
          className,
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
