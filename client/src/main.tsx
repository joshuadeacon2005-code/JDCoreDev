import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The trading-fleet routers sit behind a shared header-secret guard. Many
// admin pages call /api/(trader|predictor|arbitrage|crypto-arb)/* via raw
// fetch() rather than the apiRequest helper, so we patch fetch once at boot
// to inject x-bot-secret on those prefixes. SSE/EventSource is unaffected
// (no custom headers) and is handled separately by the routes that use it.
const BOT_API_PREFIXES = ["/api/trader", "/api/predictor", "/api/arbitrage", "/api/crypto-arb"];
const _origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL ? input.pathname : input.url;
  if (BOT_API_PREFIXES.some((p) => url.startsWith(p))) {
    const secret = (import.meta as any).env?.VITE_BOT_API_SECRET as string | undefined;
    if (secret) {
      const headers = new Headers(init?.headers || {});
      if (!headers.has("x-bot-secret")) headers.set("x-bot-secret", secret);
      init = { ...(init || {}), headers };
    }
  }
  return _origFetch(input as any, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(<App />);
