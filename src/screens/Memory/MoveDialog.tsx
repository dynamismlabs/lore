/** Choose which collections a memory is in (author only). */
import { useState } from 'react';
import { Check, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { type Memory, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  memory: Memory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MoveDialog({ memory, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const { data: collections } = trpc.stories.writableCollections.useQuery();
  const [selected, setSelected] = useState(() => new Set(memory.collections.map((c) => c.id)));
  const save = trpc.stories.setCollections.useMutation({
    onSuccess: () => {
      utils.stories.invalidate();
      utils.collections.invalidate();
      toast.success('Updated');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Collections</DialogTitle>
          <DialogDescription>Everyone in a collection can see what’s in it.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {collections?.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-accent',
                  on && 'bg-accent',
                )}
                aria-pressed={on}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-md border',
                    on && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
                <span className="flex-1 truncate">{c.name}</span>
                {c.isDefault && <Lock className="size-3.5 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate({ id: memory.id, collectionIds: [...selected] })}
            disabled={selected.size === 0 || save.isPending}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {selected.size === 0 ? 'Pick at least one' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
