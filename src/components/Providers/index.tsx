import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { ThemeProvider } from 'next-themes';
import { registerServiceWorker } from '@/lib/client/pwa';
import { createTrpcClient, trpc } from '@/lib/client/trpc';
import CaptureProvider from '@/components/Capture/CaptureProvider';
import OutboxProvider from '@/components/Outbox/OutboxProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

interface Props {
  children: React.ReactNode;
}

const NO_RETRY = new Set(['NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED', 'BAD_REQUEST']);

export default function Providers({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) => {
              if (error instanceof TRPCClientError && NO_RETRY.has(error.data?.code)) return false;
              return count < 2;
            },
          },
        },
      }),
  );
  const [trpcClient] = useState(createTrpcClient);

  // Installable + opens offline (production; see src/lib/client/pwa.ts).
  useEffect(() => registerServiceWorker(), []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>
            <OutboxProvider>
              <CaptureProvider>{children}</CaptureProvider>
            </OutboxProvider>
            <Toaster position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
