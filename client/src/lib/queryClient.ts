import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiUrl } from "./api";

type JsonRequestInit = Omit<RequestInit, "body"> & { body?: unknown };

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  methodOrUrl: string,
  urlOrOptions?: string | JsonRequestInit,
  data?: unknown | undefined,
): Promise<any> {
  let res: Response;

  if (typeof urlOrOptions === "string") {
    res = await fetch(apiUrl(urlOrOptions), {
      method: methodOrUrl,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    return res;
  }

  const init = urlOrOptions || {};
  const body: BodyInit | undefined = init.body && typeof init.body !== "string" && !(init.body instanceof FormData)
    ? JSON.stringify(init.body)
    : (init.body as BodyInit | undefined);
  res = await fetch(apiUrl(methodOrUrl), {
    ...init,
    headers: body && !(body instanceof FormData)
      ? { "Content-Type": "application/json", ...(init.headers || {}) }
      : init.headers,
    body,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(apiUrl(queryKey[0] as string), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
