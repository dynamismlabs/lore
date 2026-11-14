import { useRouter } from 'next/router';
import PersonScreen from '@/screens/Person';
import { FullScreenLoader } from '@/components/AppShell';

export default function PersonPage() {
  const { query, isReady } = useRouter();
  if (!isReady || typeof query.id !== 'string') return <FullScreenLoader />;
  return <PersonScreen key={query.id} id={query.id} />;
}
