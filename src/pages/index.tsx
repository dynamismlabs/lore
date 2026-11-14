import { useViewer } from '@/hooks/useViewer';
import HomeScreen from '@/screens/Home';
import LandingScreen from '@/screens/Landing';
import WelcomeScreen from '@/screens/Welcome';
import { FullScreenLoader } from '@/components/AppShell';

const LANDING_ONLY = process.env.NEXT_PUBLIC_LANDING_ONLY === '1';

export default function IndexPage() {
  if (LANDING_ONLY) return <LandingScreen />;
  return <AppIndex />;
}

function AppIndex() {
  // useViewer, not useSession: with no signal, whoever was signed in here still gets Home.
  const { viewer, isPending } = useViewer();
  if (isPending) return <FullScreenLoader />;
  return viewer ? <HomeScreen /> : <WelcomeScreen />;
}
