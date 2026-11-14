import Link from 'next/link';
import { HOME_URL } from '@/constants/pages';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-3xl">Nothing here</p>
      <p className="mt-2 text-sm text-muted-foreground">That page doesn’t exist.</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href={HOME_URL}>Go home</Link>
      </Button>
    </main>
  );
}
