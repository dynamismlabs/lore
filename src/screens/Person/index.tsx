import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PEOPLE_URL } from '@/constants/pages';
import { isConnectionError } from '@/lib/client/errors';
import { trpc } from '@/lib/client/trpc';
import { PersonFormDialog } from '@/screens/People';
import AppShell from '@/components/AppShell';
import MemoryFeed from '@/components/MemoryFeed';
import OfflineNotice from '@/components/OfflineNotice';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export default function PersonScreen({ id }: { id: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: person, error } = trpc.people.byId.useQuery({ id });
  const [editing, setEditing] = useState(false);
  const remove = trpc.people.delete.useMutation({
    onSuccess: () => {
      utils.people.invalidate();
      utils.stories.invalidate();
      router.replace(PEOPLE_URL);
    },
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href={PEOPLE_URL}>
        <ChevronLeft /> People
      </Link>
    </Button>
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 sm:px-6 md:pt-6">
        {error && isConnectionError(error) ? (
          <OfflineNotice />
        ) : error ? (
          <p className="py-16 text-center text-muted-foreground">This person isn’t available.</p>
        ) : !person ? (
          <Skeleton className="mt-16 h-10 w-1/2" />
        ) : (
          <>
            <PageHeader
              back={back}
              title={person.name}
              subtitle={
                [
                  person.relationship,
                  person.birthDate &&
                    `Born ${format(new Date(`${person.birthDate}T12:00:00`), 'MMMM d, yyyy')}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              actions={
                person.isMine && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Person options">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() =>
                          window.confirm(
                            `Remove ${person.name}? Memories stay; only the tags are removed.`,
                          ) && remove.mutate({ id })
                        }
                      >
                        Remove person
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
            />
            <div className="mt-8">
              <MemoryFeed
                filters={{ personId: id, sort: 'occurred' }}
                empty={
                  <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                    No memories with {person.name} yet. Tag them from any memory.
                  </p>
                }
              />
            </div>
            {editing && (
              <PersonFormDialog
                open={editing}
                onOpenChange={setEditing}
                existing={{
                  id,
                  name: person.name,
                  relationship: person.relationship,
                  birthDate: person.birthDate,
                }}
              />
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
