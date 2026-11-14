import { useRouter } from 'next/router';
import CollectionScreen from '@/screens/Collection';
import { FullScreenLoader } from '@/components/AppShell';

export default function CollectionPage() {
  const { query, isReady } = useRouter();
  if (!isReady || typeof query.id !== 'string') return <FullScreenLoader />;
  return <CollectionScreen key={query.id} id={query.id} />;
}
