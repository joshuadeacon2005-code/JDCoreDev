# Trader Routine — AutoHedge Sequence Addendum

> **Status:** OPTIONAL. The canonical routine prompt at
> `docs/ROUTINE_PROMPT_TRADER.md` is the active spec. This file proposes a
> way to wire the AutoHedge skills (Phase 6) into the trader routine, but
> nothing here fires until you splice a section back into the canonical
> prompt. Read this, pick an option, then merge or discard.

## What's the conflict?

The active trader routine already runs a **four-agent council** (parallel
debate):

```
Analyst (bull) ──┐
Contrarian (bear)│ ──> Judge ──> verdict (buy / sell / hold / skip)
Risk (sizing)  ──┘
```

AutoHedge is a **four-role sequential pipeline**:

```
Director (thesis) ──> Quant (score) ──> Risk (size) ──> Execution (order)
```

These are different decision shapes. The existing council is good at
*qualitative* debate; AutoHedge is good at *structured numerical handoff*
between roles. Neither is strictly better — they answer different questions.

## Mapping (rough)

| Existing council | AutoHedge | Notes |
|---|---|---|
| Analyst (bull) | Director | Both produce a thesis. Director is more structured (forces a single ticker and falsifiable invalidation signals). |
| Contrarian (bear) | Quant (critique side) | Both surface counter-evidence. Quant insists on numeric metrics; Contrarian allows qualitative bear data. |
| Risk (sizing) | Risk | Same role. AutoHedge Risk is more rigid: every output field must be a number, drawdown circuit-breaker is baked in, schema-validated. |
| Judge | Execution | Both produce the final go/no-go. Execution adds explicit Paper-vs-Live mode safety (TRADE-MODE-02) and writes the order payload directly. |

## Three wiring options

### Option α — Replace the council with AutoHedge

Swap Step 4 of `ROUTINE_PROMPT_TRADER.md` entirely. The routine reads each
AutoHedge SKILL.md in sequence per candidate, halting if any step rejects.

- ✓ Clean structured pipeline. Easier to debug ("which step halted?").
- ✓ Risk output is guaranteed-numeric (TRADE-AH-07).
- ✗ Loses the parallel-debate dynamic that's been working.
- ✗ Loses the Contrarian's "forced to find one specific bear data point" rule
  — that's a hard-won heuristic from real losses.
- ✗ Single bigger change to the active strategy prompt = harder to roll back.

### Option β — Layer AutoHedge on top (recommended for incremental rollout)

Keep the existing council for qualitative debate, but use AutoHedge as the
**output-formatting and Risk layer**:

1. Steps 1–3 of `ROUTINE_PROMPT_TRADER.md` unchanged.
2. Step 4 council runs as today (Analyst / Contrarian / Risk / Judge debate).
3. After the Judge produces its verdict, run AutoHedge **Risk** + **Execution**
   skills to translate the verdict into the schema-validated order payload.
4. The routine POSTs the AutoHedge Execution payload instead of the
   hand-built `decisions` array in Step 5.

- ✓ Council debate dynamic preserved.
- ✓ Picks up Risk's numeric-only rule and drawdown circuit breaker.
- ✓ Picks up Execution's Paper-default + Live-confirmation gate.
- ✓ Smallest diff to the active prompt — you splice in 2 short sections.
- ✗ Two sources of truth for sizing logic (council Risk + AutoHedge Risk) —
  you'll need to keep them aligned in future edits.

### Option γ — Side-by-side, opt-in per fire

Keep the canonical prompt as-is. Add a fire-time toggle the user sets
manually before pressing "Run Now":

```
ROUTINE_MODE=council        # default — current behaviour
ROUTINE_MODE=autohedge      # force AutoHedge sequence instead
```

- ✓ Zero risk to the active prompt. A/B Council vs AutoHedge over time.
- ✓ Easy rollback (just don't set the env var).
- ✗ Two prompt branches to maintain.
- ✗ Toggle has to be set per-fire — not autonomous.

---

## Recommended: **Option β**

Smallest blast radius for the most-aligned upside. The Risk-output-must-be-
numeric rule (TRADE-AH-07) is the single biggest win and it slots in cleanly
after the Judge without disturbing the council debate.

## Splice-in for Option β

If you choose Option β, here are the two sections to splice into
`docs/ROUTINE_PROMPT_TRADER.md`. Both replace existing content; nothing else
in the canonical prompt needs to change.

### Splice 1 — Replace Step 4's "Risk" agent (currently line 90)

**Replace:**

```markdown
3. **Risk** — sizing, days-to-catalyst, liquidity (avg daily volume × price),
   correlation with existing positions, earnings-window check. Computes
   notional given `maxPositionPct` and `currentRisk`.
```

**With:**

```markdown
3. **Risk** — sizing, days-to-catalyst, liquidity (avg daily volume × price),
   correlation with existing positions, earnings-window check. Computes
   notional given `maxPositionPct` and `currentRisk`. **Output discipline:**
   read `.claude/skills/autohedge-risk/SKILL.md` and produce its JSON output
   verbatim — entry, stop, target, position_size_shares (integer), and
   risk_reward_ratio. Every field is a NUMBER, never a phrase like "moderate
   size". The drawdown circuit-breaker rules in that SKILL.md apply: at
   `drawdown7dPct < -10` the Risk role halves per-trade %; at `-15` it
   returns `decision: "PASS"` and the Judge accepts the halt without debate.
```

### Splice 2 — Replace Step 5's payload format (currently lines 96-106)

**Replace:**

```markdown
Build the request:
```json
{
  "thesis": "...",
  "decisions": [ ... ]
}
```
```

**With:**

```markdown
Build the request. For every `buy` decision, format it via
`.claude/skills/autohedge-execution/SKILL.md` — the Execution skill packages
the council's verdict + Risk's numbers into the canonical order payload and
enforces Paper-by-default. For `sell` and `hold` decisions on existing
positions, use the simpler shape (no AutoHedge Execution needed):

```json
{
  "thesis": "<2–3 sentences>",
  "decisions": [
    /* New buys: each one is the AutoHedge Execution output object,
       with fields ticker, side, qty (Risk.position_size_shares),
       limit_price, stop_loss, take_profit, paper_or_live, etc. */
    {
      "ticker": "XYZ", "side": "buy", "qty": 47, "order_type": "limit",
      "limit_price": 18.30, "stop_loss": 16.95, "take_profit": 22.50,
      "paper_or_live": "paper", "thesis": "Phase 2 readout in 18 days...",
      "edge_score": 0.62, "risk_reward_ratio": 3.1,
      "drawdown_circuit_state": "normal", "decision_source": "agent-routine"
    },
    /* Sells/holds on existing positions stay simple — no AutoHedge needed: */
    { "action": "sell", "symbol": "ABC", "qty": 4, "rationale": "Hit +18% TP." },
    { "action": "hold", "symbol": "AMZN",          "rationale": "Grandfathered." }
  ]
}
```

The server-side `/api/trader/agent/decisions` endpoint already accepts this
shape — see `server/trader-agent.ts:191-201` for the validated decision schema.
```

That's it — two splices, no other lines change.

## Splice-in for Option α (replacement)

If you want to go full AutoHedge instead, replace Step 4 with:

```markdown
### Step 4. AutoHedge sequence per candidate

For each candidate (max 5 surfaced; **propose at most 2 buys**), run the
four AutoHedge skills in strict sequence. Each step validates the previous
step's output before continuing; a malformed step halts the chain for that
candidate.

1. **Director** — read `.claude/skills/autohedge-director/SKILL.md`. Produce
   thesis JSON. Halt this candidate if Director output fails the SKILL.md
   quality gates (vague thesis, missing invalidation signals, etc.).
2. **Quant** — read `.claude/skills/autohedge-quant/SKILL.md`. Score the
   Director output. If `verdict !== "CONFIRM"`, halt this candidate.
3. **Risk** — read `.claude/skills/autohedge-risk/SKILL.md`. Produce
   numeric position sizing. If `decision: "PASS"` (drawdown halt or
   risk_reward_ratio < 1.5), halt this candidate.
4. **Execution** — read `.claude/skills/autohedge-execution/SKILL.md`.
   Package the chain into the order payload. Enforce Paper-by-default.
   The Execution output IS the per-decision object you'll POST in Step 5.
```

And then Step 5's payload format gets the same Splice 2 from Option β.

## Splice-in for Option γ (toggle)

If you want both, add this near the top of `ROUTINE_PROMPT_TRADER.md`:

```markdown
## Mode toggle

The routine reads the `ROUTINE_MODE` env var on each fire:

- `ROUTINE_MODE=council` (default) — runs the four-agent council in Step 4,
  builds the decisions payload directly.
- `ROUTINE_MODE=autohedge` — runs the AutoHedge Director→Quant→Risk→
  Execution sequence in Step 4, uses the Execution payload directly.

If unset, default to `council`.
```

Then add the Option α replacement section as Step 4-AUTOHEDGE, conditional on
the env var.

---

## Don't merge yet

This addendum exists so you can review the proposed wiring without it
firing. The trader cron is already disabled (`enabled: false` on
`trig_01RdmE8PHaQyfruhHQeheDDb` per W3 cleanup), so even an accidental edit
to `ROUTINE_PROMPT_TRADER.md` won't cause an unscheduled fire — but the
"Run Now" button still works for manual invocations, and that reads the
canonical prompt fresh on every press.

Pick an option, splice the relevant block into the canonical prompt, run
once in Paper mode, watch the output, then enable the cron back if you want
scheduled fires again.
