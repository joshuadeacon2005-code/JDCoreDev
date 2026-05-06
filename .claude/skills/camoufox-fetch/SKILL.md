---
name: camoufox-fetch
description: Fetch a URL through JDCoreDev's stealth-scraping endpoint when WebFetch/WebSearch can't reach the target (anti-bot blocks, Cloudflare challenges, JS-only pages). Returns already-extracted plain text — never raw HTML.
---

# camoufox-fetch

A routine-callable primitive that wraps JDCoreDev's `POST /api/trader/scrape`
endpoint. Use it when the routine needs to read a URL that the built-in
WebFetch / WebSearch tools can't surface — anti-bot blocked, JS-rendered, or
behind a Cloudflare challenge.

## When to use this

Reach for `camoufox-fetch` when, and only when:

- WebFetch returns 403, "Access Denied", or a Cloudflare challenge page.
- The URL is JS-rendered and a plain HTTP fetch returns an empty body or shell.
- The source is a financial news site or social-media surface that detects bots.

Don't use it for:

- Routine homepage browsing of friendly sites (use WebFetch — cheaper).
- Internal JDCoreDev endpoints — they have dedicated agent routes.
- Anything not on the public web (the endpoint blocks internal/private IPs).

## Contract

```
POST https://www.jdcoredev.com/api/trader/scrape
Headers:
  x-jdcd-agent-key: <JDCD_AGENT_KEY env value>
  Content-Type:     application/json
Body (JSON):
  { "url": "https://example.com/article" }
```

### Successful response (HTTP 200)

```
{
  "source":        "https://example.com/article",
  "content":       "Article headline\n\nFirst paragraph...",
  "content_chars": 12345,
  "backend":       "plain",
  "fetched_at":    "2026-05-06T13:24:01.234Z"
}
```

`content` is already-extracted plain text. The endpoint strips `<script>`,
`<style>`, `<nav>`, `<footer>`, `<svg>`, `<noscript>` and all other tags before
returning. Never re-process or re-extract — the boundary is the endpoint.

### Failure responses

| Status | Meaning | What to do |
|---|---|---|
| 400  | Invalid URL, blocked scheme, or internal/private target | Don't retry. Use a different URL. |
| 401  | x-jdcd-agent-key missing or wrong | Check env wiring. Don't retry from the routine — surface the error. |
| 413  | Response over 5 MB | Use a more specific URL. Don't retry. |
| 501  | SCRAPE_BACKEND set to a v2 backend that's not implemented yet | Surface the error. Defaults are fine. |
| 502  | Upstream returned non-2xx (the target site blocked us / 404'd / etc.) | Don't retry the same URL more than 3 times. |
| 500  | Network error or timeout (20s cap) | Retry once with a 30s pause. |

## Rules

1. **Cite the source.** When the routine uses `content` in its reasoning, cite
   the `source` URL so attribution survives into council debate / decisions.
2. **Plain text only.** The endpoint never returns raw HTML. Don't try to parse
   markup; it isn't there.
3. **Cap retries at 3.** If the endpoint returns 4xx/5xx three times for the
   same URL, move on — that source is unreachable from this run.
4. **Do not call from outside the trading routines.** The endpoint is gated by
   `x-jdcd-agent-key` and is intended for use by the trader and predictor
   routine prompts only.

## Backend modes

The endpoint selects its backend at runtime via the `SCRAPE_BACKEND` env var:

| Backend | Status | Notes |
|---|---|---|
| `plain` (default) | **Live in v1.** | Built-in fetch with realistic browser headers. Works for non-aggressive Cloudflare and most public news/blogs. |
| `playwright` | v2 — not implemented yet (returns HTTP 501). | Real Firefox via `playwright-extra` with stealth plugin. For aggressive Cloudflare and JS-only pages. |
| `scrapingbee` | v2 — not implemented yet (returns HTTP 501). | Paid scraping proxy. Most reliable, costs per request. Will require `SCRAPINGBEE_API_KEY`. |

The v1 default is enough for most public financial-news sources. If the
routine encounters a target that consistently fails on `plain`, escalate to
the user — don't try to reimplement the bypass inside the routine.

## Requirement coverage (W3 Phase 4)

- **TRADE-CAM-01**: skill installed at this exact path per discovery doc decision.
- **TRADE-CAM-02**: `partial in v1` — works for many non-aggressive sources via `plain` backend; aggressive Cloudflare requires v2 backend swap.
- **TRADE-CAM-03**: extraction at the boundary — endpoint always returns plain text, never raw HTML.
- **TRADE-CAM-04**: all auth and config via env vars (`JDCD_AGENT_KEY`, `SCRAPE_BACKEND`, future `SCRAPINGBEE_API_KEY` / `PROXY_URL`). No hardcoded credentials.
- **TRADE-CAM-05**: skill name + path + invocation method documented (this file). Server endpoint at `server/scrape-agent.ts`. Mount at `server/routes.ts` — search for `scrapeAgentRouter`.
- **TRADE-MODE-01**: read-only research path; nothing here touches Live trading. No mode flag needed.
- **TRADE-MODE-02**: not applicable — no execution path through this endpoint.
