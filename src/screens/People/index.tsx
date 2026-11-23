import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { personUrl } from '@/constants/pages';
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

export default function PeopleScreen() {
  const { data: people, isPending } = trpc.people.list.useQuery();
  const [adding, setAdding] = useState(false);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 sm:px-6 md:pt-8">
        <PageHeader
          title="People"
          subtitle="Tag people in memories, then see all of theirs in one place."
          actions={
            <Button className="rounded-full" onClick={() => setAdding(true)}>
              <Plus /> Add
            </Button>
          }
        />
        <div className="mt-6 flex flex-col divide-y rounded-2xl border">
          {isPending && [0, 1, 2].map((i) => <Skeleton key={i} className="m-4 h-10" />)}
          {people?.map((person) => (
            <Link
              key={person.id}
              href={personUrl(person.id)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-accent/60"
            >
              <UserAvatar name={person.name} className="size-10" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{person.name}</div>
                {person.relationship && (
                  <div className="truncate text-sm text-muted-foreground">
                    {person.relationship}
                  </div>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {person.storyCount} {person.storyCount === 1 ? 'memory' : 'memories'}
              </span>
            </Link>
          ))}
          {people?.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No one yet. Open a memory and tap “Who’s in this?” — or add someone here.
            </div>
          )}
        </div>
      </main>
      <PersonFormDialog open={adding} onOpenChange={setAdding} />
    </AppShell>
  );
}

export function PersonFormDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: { id: string; name: string; relationship: string | null; birthDate: string | null };
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(existing?.name ?? '');
  const [relationship, setRelationship] = useState(existing?.relationship ?? '');
  const [birthDate, setBirthDate] = useState(existing?.birthDate ?? '');
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const create = trpc.people.create.useMutation();
  const update = trpc.people.update.useMutation();
  const busy = create.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields = { name, relationship: relationship || null, birthDate: birthDate || null };
    if (existing) await update.mutateAsync({ id: existing.id, ...fields });
    else await create.mutateAsync(fields);
    utils.people.invalidate();
    utils.stories.invalidate();
    onOpenChange(false);
    if (!existing) {
      setName('');
      setRelationship('');
      setBirthDate('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? 'Edit person' : 'Add a person'}</DialogTitle>
            <DialogDescription>
              People in your memories don’t need a Lore account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="person-name">Name</Label>
            <Input
              id="person-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-relationship">Relationship (optional)</Label>
            <Input
              id="person-relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Daughter, Grandpa, best friend…"
              maxLength={80}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-birthday">Birthday (optional)</Label>
            <Input
              id="person-birthday"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              min="1900-01-01"
              max={today}
            />
            <p className="text-xs text-muted-foreground">
              Lets Lore date stories like “when she was three”.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
