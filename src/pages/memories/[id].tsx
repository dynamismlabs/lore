import { useRouter } from 'next/router';
import MemoryScreen from '@/screens/Memory';
import { FullScreenLoader } from '@/components/AppShell';

export default function MemoryPage() {
  const { query, isReady } = useRouter();
  if (!isReady || typeof query.id !== 'string') return <FullScreenLoader />;
  return <MemoryScreen key={query.id} id={query.id} />;
}
