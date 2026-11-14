import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LOGIN_URL } from '@/constants/pages';
import { authClient } from '@/lib/auth/client';
import { AuthFrame } from '@/screens/Auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'done') {
    return (
      <AuthFrame title="Password updated">
        <Button asChild className="h-11 w-full rounded-xl">
          <Link href={LOGIN_URL}>Sign in</Link>
        </Button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Choose a new password">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState('saving');
          const result = await authClient.resetPassword({ newPassword: password, token });
          if (result.error) {
            setError(result.error.message ?? 'That link has expired. Request a new one.');
            setState('idle');
          } else {
            setState('done');
          }
        }}
      >
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (8+ characters)"
          minLength={8}
          autoComplete="new-password"
          required
          className="h-11"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 rounded-xl" disabled={state === 'saving' || !token}>
          {state === 'saving' && <Loader2 className="animate-spin" />}
          Save password
        </Button>
      </form>
    </AuthFrame>
  );
}
