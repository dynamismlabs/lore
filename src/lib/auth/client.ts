import { createAuthClient } from 'better-auth/react';

// Same-origin: better-auth defaults to window.location.origin + /api/auth.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
