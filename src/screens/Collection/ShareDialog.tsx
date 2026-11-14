/**
 * Invite people and manage who's in a collection. The owner creates a link
 * (emailed too when email is set up) and sends it however they like.
 */
import { useState } from 'react';
import { Check, Copy, Link2, Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { type RouterOutputs, trpc } from '@/lib/client/trpc';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { InvitableRole } from '@/db/constants';

type Collection = RouterOutputs['collections']['byId'];

const ROLE_LABEL: Record<InvitableRole, string> = {
  contributor: 'Can add memories',
  viewer: 'Can only view',
};

interface Props {
  collection: Collection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareDialog({ collection, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const isOwner = collection.role === 'owner';
  const [role, setRole] = useState<InvitableRole>('contributor');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createInvite = trpc.invites.create.useMutation();
  const pending = trpc.invites.list.useQuery(
    { collectionId: collection.id },
    { enabled: open && isOwner },
  );
  const revoke = trpc.invites.revoke.useMutation({ onSuccess: () => pending.refetch() });
  const setMemberRole = trpc.collections.setMemberRole.useMutation({
    onSuccess: () => utils.collections.byId.invalidate({ id: collection.id }),
  });
  const removeMember = trpc.collections.removeMember.useMutation({
    onSuccess: () => {
      utils.collections.invalidate();
      toast('Removed. They can no longer see this collection.');
    },
  });

  const makeLink = async () => {
    try {
      const result = await createInvite.mutateAsync({
        collectionId: collection.id,
        role,
        email: email.trim() || undefined,
      });
      setLink(result.url);
      setCopied(false);
      pending.refetch();
      if (result.emailed) toast.success(`Invite emailed to ${email.trim()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t create an invite');
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link copied');
  };

  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({
        title: `Join “${collection.name}” on Lore`,
        text: `I started a collection for our memories — “${collection.name}”. Join me:`,
        url: link,
      });
    } catch {
      // Cancelled.
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setLink(null);
          setEmail('');
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Share “{collection.name}”</DialogTitle>
          <DialogDescription>
            Everyone here sees every memory in this collection. Your other collections stay private.
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="flex flex-col gap-3">
            {link ? (
              <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="size-4" /> Invite link ready
                </div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={link}
                    className="bg-background text-xs"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link">
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
                {canNativeShare && (
                  <Button onClick={share}>
                    <Share2 /> Send it…
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Works once and expires in 14 days. Send it by text or however you like.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setLink(null)}>
                  Invite someone else
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Their email (optional)"
                    className="flex-1"
                  />
                  <Select value={role} onValueChange={(v) => setRole(v as InvitableRole)}>
                    <SelectTrigger className="w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contributor">{ROLE_LABEL.contributor}</SelectItem>
                      <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={makeLink} disabled={createInvite.isPending}>
                  {createInvite.isPending && <Loader2 className="animate-spin" />}
                  Create invite link
                </Button>
              </>
            )}
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">People</h3>
          {collection.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <UserAvatar name={member.name} image={member.image} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{member.name || member.email}</div>
                {member.email && (
                  <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                )}
              </div>
              {member.role === 'owner' ? (
                <span className="text-xs text-muted-foreground">Owner</span>
              ) : isOwner ? (
                <div className="flex items-center gap-1">
                  <Select
                    value={member.role}
                    onValueChange={(v) =>
                      setMemberRole.mutate({
                        id: collection.id,
                        userId: member.id,
                        role: v as InvitableRole,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contributor">{ROLE_LABEL.contributor}</SelectItem>
                      <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => {
                      if (
                        window.confirm(`Remove ${member.name || 'them'} from “${collection.name}”?`)
                      ) {
                        removeMember.mutate({ id: collection.id, userId: member.id });
                      }
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {member.role === 'contributor' ? 'Adds memories' : 'Views'}
                </span>
              )}
            </div>
          ))}
          {isOwner && !!pending.data?.length && (
            <>
              <h3 className="mt-2 text-sm font-medium">Waiting to join</h3>
              {pending.data.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 text-sm">
                  <div className="min-w-0 flex-1 truncate text-muted-foreground">
                    {invite.email ?? 'Invite link'} ·{' '}
                    {ROLE_LABEL[invite.role as InvitableRole] ?? invite.role}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate({ id: invite.id })}
                    disabled={revoke.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
