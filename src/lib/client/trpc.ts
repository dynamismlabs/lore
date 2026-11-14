import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import superjson from 'superjson';
import type { AppRouter } from '@/server/trpc/root';

export const trpc = createTRPCReact<AppRouter>();

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Memory = RouterOutputs['stories']['byId'];
export type CollectionSummary = RouterOutputs['collections']['list'][number];

export function createTrpcClient() {
  return trpc.createClient({
    links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
  });
}
