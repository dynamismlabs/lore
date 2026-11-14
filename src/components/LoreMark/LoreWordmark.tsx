import { cn } from '@/lib/utils';
import LoreMark from './LoreMark';

interface Props {
  className?: string;
}

/** Paired quill-and-book mark and wordmark aligned to Newsreader's baseline and optical center. */
export default function LoreWordmark({ className = 'text-2xl' }: Props = {}) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-[0.26em] pt-[0.14em] font-serif font-medium leading-none',
        className,
      )}
    >
      <LoreMark className="h-[0.84em] w-auto" />
      <span>Lore</span>
    </span>
  );
}

