/**
 * Moments in a conversation: separate memories found in a long recording. The
 * author checks each one's date and people, then adds it to the timeline or
 * dismisses it. Everyone who can see the conversation sees the added ones.
 */
import { useState } from 'react';
import { Check, Loader2, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { memoryUrl } from '@/constants/pages';
import { friendlyDate, longDate } from '@/lib/client/dates';
import { type Memory, type RouterOutputs, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import AudioPlayer from '@/components/AudioPlayer';
import DateField from '@/components/Capture/DateField';
import { memorySummary } from '@/components/MemoryCard';
import { Button } from '@/components/ui/button';

type Suggestion = RouterOutputs['moments']['forStory']['suggestions'][number];

interface Props {
  memory: Memory;
  className?: string;
}

/** Long enough to hold more than one moment. */
const MIN_DURATION_MS = 60_000;
const MIN_TRANSCRIPT_CHARS = 600;
/** Right after a long recording, the app is still looking for moments in the background. */
const FRESH_MS = 10 * 60 * 1000;

export default function Moments({ memory, className }: Props) {
  const utils = trpc.useUtils();
  const audio = memory.media.filter((m) => m.kind === 'audio');
  const long = audio.some(
    (a) => (a.durationMs ?? 0) >= MIN_DURATION_MS || (a.text?.length ?? 0) >= MIN_TRANSCRIPT_CHARS,
  );
  const { data } = trpc.moments.forStory.useQuery(
    { storyId: memory.id },
    {
      enabled: audio.length > 0,
      refetchInterval: (q) =>
        memory.isMine &&
        long &&
        !q.state.data?.suggestions.length &&
        !q.state.data?.moments.length &&
        Date.now() - memory.createdAt.getTime() < FRESH_MS
          ? 5000
          : false,
    },
  );
  const suggest = trpc.moments.suggest.useMutation();
  const accept = trpc.moments.accept.useMutation();
  const [adding, setAdding] = useState(false);

  if (!data) return null;
  const { suggestions, moments, findable } = data;
  const canFind = findable.length > 0 && long;
  if (!suggestions.length && !moments.length && !canFind) return null;

  const refresh = () => {
    utils.moments.forStory.invalidate({ storyId: memory.id });
    utils.stories.invalidate();
    utils.people.invalidate();
  };

  const find = async () => {
    try {
      let total = 0;
      for (const mediaId of findable) total += (await suggest.mutateAsync({ mediaId })).found;
      if (!total) toast('No separate moments found in this recording');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t look through this recording');
    } finally {
      refresh();
    }
  };

  const addAll = async () => {
    setAdding(true);
    try {
      for (const s of suggestions) {
        await accept.mutateAsync({
          id: s.id,
          personIds: s.people.flatMap((p) => (p.id ? [p.id] : [])),
        });
      }
      toast(`Added ${suggestions.length} moments to your timeline`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t add them all');
    } finally {
      setAdding(false);
      refresh();
    }
  };

  return (
    <section aria-labelledby="moments-heading" className={cn('border-t pt-6', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="moments-heading" className="font-serif text-xl">
          Moments in this conversation
        </h2>
        {suggestions.length > 1 && (
          <Button variant="ghost" size="sm" onClick={addAll} disabled={adding}>
            {adding && <Loader2 className="animate-spin" />}
            Add all
          </Button>
        )}
      </div>

      {suggestions.length > 0 && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Check when each one happened, then add the ones you want on your timeline.
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {suggestions.map((s) => (
              <li key={s.id}>
                <SuggestionCard
                  suggestion={s}
                  audioUrl={audio.find((a) => a.id === s.mediaId)?.url ?? null}
                  onDone={refresh}
                />
              </li>
            ))}
          </ol>
        </>
      )}

      {moments.length > 0 && (
        <>
          {suggestions.length > 0 && (
            <h3 className="mt-6 text-sm font-medium text-muted-foreground">Already added</h3>
          )}
          <ol className="mt-4 flex flex-col">
            {moments.map((m) => (
              <li key={m.id}>
                <Link
                  href={memoryUrl(m.id)}
                  className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-2 hover:bg-accent"
                >
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {friendlyDate(m.occurredAt, m.occurredPrecision)}
                  </span>
                  <span className="min-w-0 truncate font-serif">
                    {m.title || memorySummary(m) || 'A moment'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}

      {canFind && !suggestions.length && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={find} disabled={suggest.isPending}>
            {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {moments.length ? 'Look for more moments' : 'Find moments'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {suggest.isPending
              ? 'Looking through the conversation…'
              : !moments.length && 'Turn each story told here into its own memory.'}
          </span>
        </div>
      )}
    </section>
  );
}

function SuggestionCard({
  suggestion,
  audioUrl,
  onDone,
}: {
  suggestion: Suggestion;
  audioUrl: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(suggestion.occurredAt);
  const [precision, setPrecision] = useState(suggestion.occurredPrecision);
  // People already in People start ticked; new names wait for a tap.
  const [chosen, setChosen] = useState(
    () => new Set(suggestion.people.flatMap((p) => (p.id ? [p.name] : []))),
  );
  const accept = trpc.moments.accept.useMutation({
    onSuccess: ({ storyId }) => {
      toast('Added to your timeline', {
        action: { label: 'Open', onClick: () => router.push(memoryUrl(storyId)) },
      });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const dismiss = trpc.moments.dismiss.useMutation({
    onSuccess: onDone,
    onError: (e) => toast.error(e.message),
  });
  const busy = accept.isPending || dismiss.isPending;

  const toggle = (name: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <article className="rounded-2xl border bg-card p-4">
      <DateField
        value={date}
        precision={precision}
        onChange={(next, nextPrecision) => {
          setDate(next);
          setPrecision(nextPrecision);
        }}
      >
        {longDate(date, precision)}
      </DateField>
      {suggestion.title && (
        <h3 className="mt-2 font-serif text-lg font-medium leading-snug">{suggestion.title}</h3>
      )}
      <p className="mt-1 whitespace-pre-wrap font-serif text-[1.02rem] leading-relaxed text-muted-foreground">
        {suggestion.summary}
      </p>
      {audioUrl && suggestion.startMs != null && suggestion.endMs != null && (
        <AudioPlayer
          src={audioUrl}
          startMs={suggestion.startMs}
          endMs={suggestion.endMs}
          className="mt-3"
        />
      )}
      {suggestion.people.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Who’s in it">
          {suggestion.people.map((person) => {
            const on = chosen.has(person.name);
            return (
              <button
                key={person.name}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(person.name)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors',
                  on
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-dashed text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {person.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => dismiss.mutate({ id: suggestion.id })}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            accept.mutate({
              id: suggestion.id,
              occurredAt: date,
              occurredPrecision: precision,
              personIds: suggestion.people.flatMap((p) =>
                p.id && chosen.has(p.name) ? [p.id] : [],
              ),
              newPeople: suggestion.people.flatMap((p) =>
                !p.id && chosen.has(p.name) ? [p.name] : [],
              ),
            })
          }
        >
          {accept.isPending && <Loader2 className="animate-spin" />}
          Add to timeline
        </Button>
      </div>
    </article>
  );
}
