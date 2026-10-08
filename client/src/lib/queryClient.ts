import { QueryClient } from "@tanstack/react-query";
// Queries declare their browser-local data source explicitly; there is no default HTTP API.
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { refetchInterval: false, refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
  mutations: { retry: false },
} });
