import type { MemberRole } from '@/db/constants';

const RANK: Record<MemberRole, number> = { viewer: 0, contributor: 1, owner: 2 };

export function roleAtLeastClient(role: MemberRole | null | undefined, min: MemberRole) {
  return !!role && RANK[role] >= RANK[min];
}
