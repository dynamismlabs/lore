/**
 * One-step invite dialog from anywhere in the app (Home, Moments, Settings,
 * Sidebar). If you only have the private Moments collection so far, it creates
 * your first shared collection (pre-filled as "Our family"), optionally shares
 * your existing memories into it, and generates the invite link in a single click.
 */
import { useState } from 'react';
import { Check, Copy, Link2, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { writePreferredCollectionId } from '@/lib/client/device';
import { trpc } from '@/lib/client/trpc';
import { useViewer } from '@/hooks/useViewer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InvitableRole } from '@/db/constants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABEL: Record<InvitableRole, string> = {
  contributor: 'Can add memories',
  viewer: 'Can only view',
};

export default function QuickInviteDialog({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const { viewer } = useViewer();
  const { data: collections } = trpc.collections.list.useQuery(undefined, { enabled: open });
  const sharedOwned = (collections ?? []).filter((c) => !c.isDefault && c.role === 'owner');
  const moments = (collections ?? []).find((c) => c.isDefault);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [newCollectionName, setNewCollectionName] = useState('Our family');
  const [includeMoments, setIncludeMoments] = useState(true);
  const [role, setRole] = useState<InvitableRole>('contributor');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const createCollection = trpc.collections.create.useMutation();
  const createInvite = trpc.invites.create.useMutation();
  const busy = createCollection.isPending || createInvite.isPending;

  const creatingNew = sharedOwned.length === 0 || selectedCollectionId === '__new__';
  const activeCollectionId =
    selectedCollectionId && selectedCollectionId !== '__new__'
      ? selectedCollectionId
      : (sharedOwned[0]?.id ?? '');

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let collectionId = activeCollectionId;
      let collectionTitle =
        sharedOwned.find((c) => c.id === activeCollectionId)?.name ?? newCollectionName.trim();

      if (creatingNew || !collectionId) {
        const nameToCreate = newCollectionName.trim() || 'Our family';
        const created = await createCollection.mutateAsync({
          name: nameToCreate,
          description: null,
          includeMoments: sharedOwned.length === 0 ? includeMoments : false,
        });
        collectionId = created.id;
        collectionTitle = nameToCreate;
        if (viewer?.id) writePreferredCollectionId(viewer.id, collectionId);
        await utils.collections.invalidate();
        await utils.stories.writableCollections.invalidate();
        await utils.stories.invalidate();
      }

      const result = await createInvite.mutateAsync({
        collectionId,
        role,
        email: email.trim() || undefined,
      });
      setLink(result.url);
      setTargetName(collectionTitle);
      setCopied(false);
      if (result.emailed) toast.success(`Invite emailed to ${email.trim()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t create invite link');
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Invite link copied');
  };

  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({
        title: `Join “${targetName}” on Lore`,
        text: `I set up Lore for our memories — join “${targetName}”:`,
        url: link,
      });
    } catch {
      // User cancelled share sheet
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setLink(null);
          setEmail('');
          setCopied(false);
        }
      }}
    >
      <DialogContent className="sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Invite someone to Lore</DialogTitle>
          <DialogDescription>
            {sharedOwned.length === 0
              ? 'We’ll create your shared family collection and make it your default so everything you both capture is shared automatically.'
              : 'Send an invite link so your partner, family, or friends can add and view memories together.'}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="size-4" /> Invite link for “{targetName}”
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
                <Share2 /> Send link…
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Works once and expires in 14 days. Send it by text, iMessage, WhatsApp, or email.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setLink(null)}>
              Create another link
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreateLink} className="flex flex-col gap-4">
            {sharedOwned.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Collection to share</Label>
                <Select
                  value={creatingNew ? '__new__' : activeCollectionId}
                  onValueChange={setSelectedCollectionId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sharedOwned.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Create a new collection…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {creatingNew && (
              <div className="grid gap-1.5">
                <Label htmlFor="quick-invite-collection">Shared collection name</Label>
                <Input
                  id="quick-invite-collection"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Our family"
                  maxLength={80}
                  required
                />
              </div>
            )}

            {creatingNew && sharedOwned.length === 0 && (moments?.storyCount ?? 0) > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-muted/30 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={includeMoments}
                  onChange={(e) => setIncludeMoments(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-input accent-foreground"
                />
                <span>
                  <span className="font-medium text-foreground">
                    Include my existing memories ({moments?.storyCount})
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Share what you’ve already recorded in Moments into this collection too.
                  </span>
                </span>
              </label>
            )}

            <div className="grid gap-1.5">
              <Label>What they can do</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InvitableRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">{ROLE_LABEL.contributor}</SelectItem>
                  <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="quick-invite-email">Their email (optional)</Label>
              <Input
                id="quick-invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Leave blank to just copy a link"
              />
            </div>

            <Button type="submit" disabled={busy || (creatingNew && !newCollectionName.trim())}>
              {busy && <Loader2 className="animate-spin" />}
              {creatingNew ? 'Create collection & get invite link' : 'Get invite link'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
