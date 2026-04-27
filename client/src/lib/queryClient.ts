import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Trading-fleet routers (trader, predictor, arbitrage, crypto-arb) sit behind
// a shared header-secret guard so scheduled Claude routines can call them.
// The admin UI uses the same header. The secret is injected at build time via
// VITE_BOT_API_SECRET; if absent, requests proceed unauthenticated and the
// server returns 401 with a clear message.
const BOT_API_PREFIXES = ["/api/trader", "/api/predictor", "/api/arbitrage", "/api/crypto-arb"];

function botSecretHeader(url: string): Record<string, string> {
  if (!BOT_API_PREFIXES.some((p) => url.startsWith(p))) return {};
  const secret = (import.meta as any).env?.VITE_BOT_API_SECRET as string | undefined;
  return secret ? { "x-bot-secret": secret } : {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...botSecretHeader(url),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = await fetch(url, {
      credentials: "include",
      headers: botSecretHeader(url),
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
