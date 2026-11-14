import { useRouter } from 'next/router';
import InviteScreen from '@/screens/Invite';
import { FullScreenLoader } from '@/components/AppShell';

export default function InvitePage() {
  const { query, isReady } = useRouter();
  if (!isReady || typeof query.token !== 'string') return <FullScreenLoader />;
  return <InviteScreen token={query.token} />;
}
