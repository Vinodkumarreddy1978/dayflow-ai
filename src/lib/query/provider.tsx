"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The query client is created inside state rather than at module scope so that
 * each request gets its own during server rendering. A module-level client would
 * be shared across users on the server, which is a data leak, not a performance
 * optimisation.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Realtime pushes changes to us (DF-SYN-020), so aggressive polling
            // would be redundant traffic. The stale window covers the gap while
            // a socket reconnects.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: (failureCount, error) => {
              // Never retry an authorisation failure: the answer will not change
              // and the retries delay the redirect to sign-in.
              const status = (error as { status?: number }).status;
              if (status === 401 || status === 403) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
