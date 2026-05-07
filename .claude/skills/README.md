# JDCoreDev Project-Level Skills

Project-level Claude Code skills checked into the JDCoreDev repo. Used by the
trader and predictor routines that run interactively from the Claude Code
section of the Claude app.

Per `docs/trading-routine-architecture.md` (Phase 3 discovery), the install
pattern for new W3 tooling is **project-level skill + thin Express endpoint
behind `x-jdcd-agent-key`** — not user-level skills, not MCP servers.

## Skill index

### Stealth fetch (Phase 4)
- [`camoufox-fetch/`](camoufox-fetch/SKILL.md) — fetch a URL when WebFetch /
  WebSearch can't reach it (Cloudflare-blocked, JS-only, anti-bot). Calls
  `POST /api/trader/scrape`. v1 uses plain fetch with realistic headers.
  v2 will add playwright + stealth or scrapingbee.

### External financial data layer (Phase 5)
- [`financial-data/`](financial-data/SKILL.md) — fetch source-attributed
  financial data for a ticker or macro indicator: Yahoo fundamentals
  (income/balance/cashflow + financialData + key statistics via the
  `yahoo-finance2` `quoteSummary` modules — no API key required),
  AlphaVantage news with sentiment scores via `NEWS_SENTIMENT` (free 500/day
  key), Yahoo EOD prices (fallback price source via `yahoo-finance2.historical`),
  FRED macro time-series, and FRED series search.
  Calls `GET /api/trader/data/:dataset/:ticker`,
  `GET /api/trader/data/macro/:series_id`, and
  `GET /api/trader/data/macro_search`. Every response carries `provider`
  (`yahoo`, `alphavantage`, or `fred`) + `dataset` + `ticker_or_series` +
  `fetched_at` so source attribution survives into routine research output.
  Toggle via `EXTERNAL_DATA_ENABLED` env, `?enabled=false` query, or
  routine-prompt mode gating (default ON for Paper, opt-in for Live).
  Yahoo branches need no key; `news` needs `ALPHA_VANTAGE_API_KEY` and
  `macro_*` needs `FRED_API_KEY` on Railway. Originally shipped against EODHD
  ($19.99/mo) on 2026-05-07 and rescoped same day to the free stack.


### AutoHedge agent patterns (Phase 6)
- [`autohedge-director/`](autohedge-director/SKILL.md) — generate a trading
  thesis (ticker, side, catalysts, invalidation signals).
- [`autohedge-quant/`](autohedge-quant/SKILL.md) — score the thesis with
  concrete metrics; CONFIRM, REJECT, or NO_DATA.
- [`autohedge-risk/`](autohedge-risk/SKILL.md) — size the position with
  explicit numbers (entry, stop, target, shares) using account equity and
  the active risk profile. Drawdown circuit breaker built in.
- [`autohedge-execution/`](autohedge-execution/SKILL.md) — package the chain
  into an order payload and POST to `/api/trader/agent/decisions`. Enforces
  Paper-by-default and Live-mode confirmation gate.

The four AutoHedge skills are designed to compose in sequence:
**Director → Quant → Risk → Execution**. Each step validates the previous
step's output before continuing; a malformed step halts the chain.

## Pattern conventions

- Each skill lives at `.claude/skills/<name>/SKILL.md` with YAML frontmatter
  (`name`, `description`).
- Skills are prompt-only by default (markdown that the routine reads). Where
  a primitive needs server-side state, secrets, or live-API auth, the skill
  is paired with a thin Express endpoint behind `x-jdcd-agent-key`.
- AutoHedge is patterns-only (TRADE-AH-05): no `pip install autohedge`,
  no Python sidecar, no scheduled process. Just Markdown + JSON schemas.
- Mode safety: every new W3 code path defaults to Paper (TRADE-MODE-01).
  Live mode requires an explicit `LIVE_MODE_AUTHORIZED=true` flag in the
  routine prompt for that fire (TRADE-MODE-02).

## How to wire a skill into a routine prompt

The routine prompts at `docs/ROUTINE_PROMPT_TRADER.md` and
`docs/ROUTINE_PROMPT_PREDICTOR.md` are the entry points. To enable a skill
in a routine fire, reference it in the prompt:

```markdown
For new entries, run the AutoHedge sequence:
1. Read .claude/skills/autohedge-director/SKILL.md and produce the Director output.
2. Read .claude/skills/autohedge-quant/SKILL.md and score the thesis.
3. If Quant verdict = CONFIRM, read .claude/skills/autohedge-risk/SKILL.md
   and produce position-sizing numbers.
4. If Risk decision = TAKE, read .claude/skills/autohedge-execution/SKILL.md
   and POST the payload to /api/trader/agent/decisions.
```

Wiring the routine prompts to use these skills is a separate decision left
to the user — the skills ship with this commit but the trader/predictor
prompts are not auto-modified.
