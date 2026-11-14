/**
 * The floating pill at the bottom of a collection page (desktop): add to it,
 * invite someone, or play it as a story. On phones the tab bar's + already
 * adds here, and Invite / Play sit in the intro.
 */
import { Fragment } from 'react';
import { Camera, Mic, PenLine, Play, UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCapture } from '@/components/Capture/CaptureProvider';

interface Props {
  collectionId: string;
  canAdd: boolean;
  /** Shared collections only (Moments is private). */
  showPeople: boolean;
  isOwner: boolean;
  canPlay: boolean;
  onPeople: () => void;
  onPlay: () => void;
}

interface Action {
  label: string;
  icon: typeof Mic;
  onClick: () => void;
}

export default function ActionPill({
  collectionId,
  canAdd,
  showPeople,
  isOwner,
  canPlay,
  onPeople,
  onPlay,
}: Props) {
  const capture = useCapture();
  const groups: Action[][] = [];
  if (canAdd) {
    groups.push([
      { label: 'Record', icon: Mic, onClick: () => capture.record(collectionId) },
      { label: 'Write', icon: PenLine, onClick: () => capture.write(collectionId) },
      { label: 'Photos', icon: Camera, onClick: () => capture.photos(collectionId) },
    ]);
  }
  if (showPeople) {
    groups.push([{ label: isOwner ? 'Invite' : 'People', icon: isOwner ? UserPlus : Users, onClick: onPeople }]);
  }
  if (canPlay) groups.push([{ label: 'Play', icon: Play, onClick: onPlay }]);
  if (!groups.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 hidden justify-center md:left-52 md:flex">
      <div
        role="toolbar"
        aria-label="Collection actions"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-primary p-1.5 text-primary-foreground shadow-xl shadow-black/15 ring-1 ring-black/5 dark:ring-white/10"
      >
        {groups.map((group, g) => (
          <Fragment key={g}>
            {g > 0 && <span className="mx-1.5 h-5 w-px bg-primary-foreground/20" aria-hidden />}
            {group.map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50"
              >
                <Icon className={cn('size-4', label === 'Play' && 'fill-current')} />
                {label}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
