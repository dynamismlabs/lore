import { TRPCClientError } from '@trpc/client';

/** The request never got an answer (offline, dropped connection) — not "not found". */
export function isConnectionError(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (error instanceof TRPCClientError) {
    return !(error.data as { httpStatus?: number } | undefined)?.httpStatus;
  }
  return error instanceof TypeError;
}
