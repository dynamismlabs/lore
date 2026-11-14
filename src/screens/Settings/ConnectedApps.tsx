/** Use Lore from ChatGPT, Ri or any MCP client — and see/disconnect what's connected. */
import { useState, useSyncExternalStore } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Check, Copy, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/client/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const subscribe = () => () => {};

export default function ConnectedApps() {
  const utils = trpc.useUtils();
  const { data: apps } = trpc.connections.list.useQuery();
  const revoke = trpc.connections.revoke.useMutation({
    onSuccess: () => {
      utils.connections.list.invalidate();
      toast('Disconnected');
    },
  });
  const mcpUrl = useSyncExternalStore(
    subscribe,
    () => `${window.location.origin}/mcp`,
    () => '',
  );
  const [copied, setCopied] = useState(false);

  return (
    <section className="mt-10 flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Use Lore from your AI assistant</h2>
      <p className="text-sm text-muted-foreground">
        Add this MCP server URL in ChatGPT (Settings → Apps → Create) or Ri (Settings → Plugins →
        Add MCP server). You’ll sign in here and approve it. Assistants can search and add memories,
        never delete.
      </p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={mcpUrl}
          className="font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy MCP URL"
          onClick={async () => {
            await navigator.clipboard.writeText(mcpUrl);
            setCopied(true);
            toast.success('Copied');
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      {!!apps?.length && (
        <div className="mt-2 flex flex-col divide-y rounded-xl border">
          {apps.map((app) => (
            <div key={app.clientId} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Plug className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{app.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {app.redirectHost}
                  {app.lastUsedAt &&
                    ` · active ${formatDistanceToNowStrict(app.lastUsedAt, { addSuffix: true })}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() =>
                  window.confirm(`Disconnect ${app.name}? It will lose access right away.`) &&
                  revoke.mutate({ clientId: app.clientId })
                }
              >
                Disconnect
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
