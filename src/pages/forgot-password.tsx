import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { AuthFrame } from '@/screens/Auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  if (state === 'sent') {
    return (
      <AuthFrame title="Check your email">
        <p className="text-muted-foreground">
          If there’s an account for {email}, a reset link is on its way.
        </p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Reset your password">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState('sending');
          await authClient.requestPasswordReset({
            email: email.trim(),
            redirectTo: `${window.location.origin}/reset-password`,
          });
          setState('sent');
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          required
          className="h-11"
        />
        <Button type="submit" className="h-11 rounded-xl" disabled={state === 'sending'}>
          {state === 'sending' && <Loader2 className="animate-spin" />}
          Send reset link
        </Button>
      </form>
    </AuthFrame>
  );
}
