import { useState } from 'react';
import { Images, Loader2, Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { collectionUrl } from '@/constants/pages';
import { trpc } from '@/lib/client/trpc';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export default function CollectionsScreen() {
  const { data: collections, isPending } = trpc.collections.list.useQuery();
  const [creating, setCreating] = useState(false);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-10 sm:px-6 md:pt-8">
        <PageHeader
          title="Collections"
          subtitle="Share a collection and everyone in it can add memories."
          actions={
            <Button onClick={() => setCreating(true)} className="rounded-full">
              <Plus /> New
            </Button>
          }
        />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />)}
          {collections?.map((c) => (
            <Link
              key={c.id}
              href={collectionUrl(c.id)}
              className="group overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/20"
            >
              <div className="relative aspect-[16/10] bg-muted">
                {c.coverUrl ? (
                  <img src={c.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground/50">
                    <Images className="size-8" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-serif text-lg font-medium">{c.name}</h2>
                  {c.isDefault && (
                    <Lock
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="Only you"
                    />
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex -space-x-1.5">
                    {c.members.slice(0, 4).map((m) => (
                      <UserAvatar
                        key={m.id}
                        name={m.name}
                        image={m.image}
                        className="size-5 ring-2 ring-card"
                      />
                    ))}
                  </div>
                  <span>
                    {c.storyCount} {c.storyCount === 1 ? 'memory' : 'memories'}
                    {c.isDefault
                      ? ' · only you'
                      : c.memberCount > 1
                        ? ` · ${c.memberCount} people`
                        : ''}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {collections && collections.length === 1 && (
          <div className="mt-6 rounded-2xl border border-dashed p-6 text-center">
            <p className="font-serif text-lg">Make one to share</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              “Our family”, “Maya’s first year”, “Grandpa’s stories” — create a collection, then
              invite the people who should add to it.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => setCreating(true)}>
              <Plus /> New collection
            </Button>
          </div>
        )}
      </main>
      <CollectionFormDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}

export function CollectionFormDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: { id: string; name: string; description: string | null };
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const create = trpc.collections.create.useMutation();
  const update = trpc.collections.update.useMutation();
  const busy = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existing) {
      await update.mutateAsync({ id: existing.id, name, description: description || null });
      utils.collections.invalidate();
      utils.stories.invalidate();
      onOpenChange(false);
    } else {
      const { id } = await create.mutateAsync({ name, description: description || null });
      utils.collections.invalidate();
      utils.stories.writableCollections.invalidate();
      onOpenChange(false);
      setName('');
      setDescription('');
      router.push(collectionUrl(id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? 'Edit collection' : 'New collection'}</DialogTitle>
            <DialogDescription>
              {existing
                ? 'Everyone in it will see the change.'
                : 'You can invite people after it’s created.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Our family"
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="collection-description">Description (optional)</Label>
            <Textarea
              id="collection-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              className="resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              {existing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
