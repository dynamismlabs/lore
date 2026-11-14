/**
 * Invite links into a collection. The owner creates a link (and optionally
 * emails it); whoever opens it signs in or signs up and joins with the
 * invite's role. Links are single-use and expire after 14 days; only a hash of
 * the token is stored.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { isEmailConfigured, sendEmail, simpleEmailHtml } from '@/services/server/email';
import { generateToken, sha256Hex } from '@/lib/server/tokens';
import { runBatch } from '@/db';
import { INVITABLE_ROLES, type MemberRole } from '@/db/constants';
import { collectionInvites, collectionMembers, collections, users } from '@/db/schema';
import { getMembershipRole, requireCollectionRole, roleAtLeast } from '../authz';
import { protectedProcedure, publicProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);
const token = z.string().min(10).max(200);
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function inviteUrl(origin: string, rawToken: string) {
  return `${origin}/invite/${rawToken}`;
}

async function loadInvite(db: Parameters<typeof requireCollectionRole>[0], rawToken: string) {
  const [row] = await db
    .select({
      invite: collectionInvites,
      collectionName: collections.name,
      inviterName: users.name,
    })
    .from(collectionInvites)
    .innerJoin(collections, eq(collections.id, collectionInvites.collectionId))
    .innerJoin(users, eq(users.id, collectionInvites.createdBy))
    .where(eq(collectionInvites.tokenHash, await sha256Hex(rawToken)))
    .limit(1);
  return row ?? null;
}

function inviteStatus(invite: typeof collectionInvites.$inferSelect) {
  if (invite.revokedAt) return 'revoked' as const;
  if (invite.acceptedAt) return 'used' as const;
  if (invite.expiresAt.getTime() < Date.now()) return 'expired' as const;
  return 'valid' as const;
}

export const invitesRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        collectionId: id,
        role: z.enum(INVITABLE_ROLES).default('contributor'),
        email: z.string().trim().email().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { collection } = await requireCollectionRole(
        ctx.db,
        ctx.userId,
        input.collectionId,
        'owner',
      );
      if (collection.isDefault) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Personal is just for you. Share “Our family” or another collection instead.',
        });
      }
      const rawToken = generateToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await ctx.db.insert(collectionInvites).values({
        id: uuidv7(),
        collectionId: input.collectionId,
        tokenHash: await sha256Hex(rawToken),
        role: input.role,
        email: input.email?.toLowerCase() ?? null,
        createdBy: ctx.userId,
        expiresAt,
      });
      const url = inviteUrl(ctx.origin, rawToken);

      let emailed = false;
      if (input.email && isEmailConfigured()) {
        const inviter = ctx.viewer.name || 'Someone';
        await sendEmail({
          to: input.email,
          subject: `${inviter} invited you to “${collection.name}” on Lore`,
          text: `${inviter} invited you to share memories in “${collection.name}”. Join here: ${url}`,
          html: simpleEmailHtml({
            heading: `Join “${collection.name}”`,
            body: `${inviter} invited you to share memories together on Lore.`,
            cta: 'Accept invite',
            url,
          }),
        });
        emailed = true;
      }
      return { url, expiresAt, emailed, emailAvailable: isEmailConfigured() };
    }),

  /** Pending invites for the owner to see/revoke. Links can't be re-shown (only hashes are kept). */
  list: protectedProcedure.input(z.object({ collectionId: id })).query(async ({ ctx, input }) => {
    await requireCollectionRole(ctx.db, ctx.userId, input.collectionId, 'owner');
    return ctx.db
      .select({
        id: collectionInvites.id,
        role: collectionInvites.role,
        email: collectionInvites.email,
        createdAt: collectionInvites.createdAt,
        expiresAt: collectionInvites.expiresAt,
      })
      .from(collectionInvites)
      .where(
        and(
          eq(collectionInvites.collectionId, input.collectionId),
          isNull(collectionInvites.acceptedAt),
          isNull(collectionInvites.revokedAt),
          gt(collectionInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(collectionInvites.createdAt));
  }),

  revoke: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const [invite] = await ctx.db
      .select()
      .from(collectionInvites)
      .where(eq(collectionInvites.id, input.id))
      .limit(1);
    if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    await requireCollectionRole(ctx.db, ctx.userId, invite.collectionId, 'owner');
    await ctx.db
      .update(collectionInvites)
      .set({ revokedAt: new Date() })
      .where(eq(collectionInvites.id, input.id));
    return { id: input.id };
  }),

  /** What the invite page shows before you sign in. Anyone holding the link can see this. */
  preview: publicProcedure.input(z.object({ token })).query(async ({ ctx, input }) => {
    const row = await loadInvite(ctx.db, input.token);
    if (!row) return { status: 'invalid' as const };
    const status = inviteStatus(row.invite);
    const alreadyMember =
      ctx.viewer && (await getMembershipRole(ctx.db, ctx.viewer.id, row.invite.collectionId));
    return {
      status: alreadyMember ? ('member' as const) : status,
      collectionId: alreadyMember ? row.invite.collectionId : null,
      collectionName: row.collectionName,
      inviterName: row.inviterName || 'Someone',
      role: row.invite.role,
      email: row.invite.email,
    };
  }),

  accept: protectedProcedure.input(z.object({ token })).mutation(async ({ ctx, input }) => {
    const row = await loadInvite(ctx.db, input.token);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'This invite link isn’t valid' });
    const { invite } = row;
    const existing = await getMembershipRole(ctx.db, ctx.userId, invite.collectionId);
    if (existing) return { collectionId: invite.collectionId, alreadyMember: true };

    const status = inviteStatus(invite);
    if (status !== 'valid') {
      const message = {
        revoked: 'This invite was cancelled. Ask for a new link.',
        used: 'This invite link has already been used. Ask for a new one.',
        expired: 'This invite link has expired. Ask for a new one.',
      }[status];
      throw new TRPCError({ code: 'BAD_REQUEST', message });
    }

    const role: MemberRole = roleAtLeast(invite.role, 'owner') ? 'contributor' : invite.role;
    await runBatch(ctx.db, (tx) => [
      tx
        .insert(collectionMembers)
        .values({ collectionId: invite.collectionId, userId: ctx.userId, role })
        .onConflictDoNothing(),
      tx
        .update(collectionInvites)
        .set({ acceptedAt: new Date(), acceptedBy: ctx.userId })
        .where(and(eq(collectionInvites.id, invite.id), isNull(collectionInvites.acceptedAt))),
    ]);
    return { collectionId: invite.collectionId, alreadyMember: false };
  }),
});
