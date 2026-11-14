import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, Send } from 'lucide-react';
import { trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  storyId: string;
  className?: string;
}

function timeAgo(date: Date) {
  const text = formatDistanceToNowStrict(date, { addSuffix: true });
  return /second/.test(text) ? 'just now' : text;
}

export default function Comments({ storyId, className }: Props) {
  const utils = trpc.useUtils();
  const { data: comments } = trpc.comments.list.useQuery({ storyId });
  const [body, setBody] = useState('');
  const refresh = () => {
    utils.comments.list.invalidate({ storyId });
    utils.stories.byId.invalidate({ id: storyId });
    utils.stories.list.invalidate();
  };
  const create = trpc.comments.create.useMutation({
    onSuccess: () => {
      setBody('');
      refresh();
    },
  });
  const remove = trpc.comments.delete.useMutation({ onSuccess: refresh });

  const submit = () => {
    if (body.trim()) create.mutate({ storyId, body: body.trim() });
  };

  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label="Comments">
      {comments?.map((comment) => (
        <div key={comment.id} className="group flex gap-3">
          <UserAvatar name={comment.author.name} image={comment.author.image} className="size-7" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{comment.author.name}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
              {comment.canDelete && (
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  onClick={() =>
                    window.confirm('Delete this comment?') && remove.mutate({ id: comment.id })
                  }
                >
                  Delete
                </button>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed">{comment.body}</p>
          </div>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={1}
          className="min-h-10 resize-none rounded-xl"
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <Button
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={submit}
          disabled={!body.trim() || create.isPending}
          aria-label="Post comment"
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </section>
  );
}
