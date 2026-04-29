/**
 * Unit tests for the edge-filter logic used in both Kalshi and Polymarket pipelines.
 *
 * Sign convention (both platforms, decimal 0–1 range):
 *   YES bet:  edge = model_probability − market_ask_price
 *   NO bet:   edge = market_bid_price  − model_probability
 *             (simplification of (1 − model_prob) − (1 − market_bid))
 *
 * A bet is placed only when edge >= minEdge (positive, above threshold).
 * Negative edge must ALWAYS be blocked — Math.abs must NOT be applied.
 */

import { describe, it, expect } from "vitest";

// ── Pure edge-filter function (mirrors the predictor logic) ─────────────────

function computeYesEdge(modelProb: number, marketAskPrice: number): number {
  return modelProb - marketAskPrice;
}

function computeNoEdge(modelProb: number, marketBidPrice: number): number {
  return marketBidPrice - modelProb;
}

interface BetDecision {
  allowed: boolean;
  reason?: string;
}

function edgeFilter(edge: number, minEdge: number): BetDecision {
  if (edge < minEdge) {
    return { allowed: false, reason: "below_min_edge" };
  }
  return { allowed: true };
}

// ── Tests ───────────────────────────────────────────────────────────────────

const MIN_EDGE = 0.10; // 10 pp — the configured threshold from the dashboard

describe("edge sign convention — YES side", () => {
  it("positive edge above threshold → PASS (bet allowed)", () => {
    const edge = computeYesEdge(0.75, 0.55); // +20pp
    expect(edge).toBeCloseTo(0.20);
    expect(edgeFilter(edge, MIN_EDGE).allowed).toBe(true);
  });

  it("positive edge exactly at threshold → PASS", () => {
    const edge = computeYesEdge(0.65, 0.55); // exactly +10pp
    expect(edge).toBeCloseTo(0.10);
    expect(edgeFilter(edge, MIN_EDGE).allowed).toBe(true);
  });

  it("positive edge below threshold → BLOCKED", () => {
    const edge = computeYesEdge(0.60, 0.55); // +5pp — below 10pp min
    expect(edge).toBeCloseTo(0.05);
    const result = edgeFilter(edge, MIN_EDGE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("below_min_edge");
  });

  it("negative edge (model below market) → BLOCKED regardless of magnitude", () => {
    const edge = computeYesEdge(0.30, 0.68); // −38pp — would pass Math.abs check!
    expect(edge).toBeCloseTo(-0.38);
    const result = edgeFilter(edge, MIN_EDGE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("below_min_edge");
  });

  it("large negative edge → BLOCKED (Math.abs bug would have allowed this)", () => {
    const edge = computeYesEdge(0.20, 0.65); // −45pp
    expect(edge).toBeCloseTo(-0.45);
    const result = edgeFilter(edge, MIN_EDGE);
    expect(result.allowed).toBe(false);
  });
});

describe("edge sign convention — NO side", () => {
  it("positive NO-side edge above threshold → PASS", () => {
    const edge = computeNoEdge(0.35, 0.60); // bid=0.60, model=0.35 → +25pp NO edge
    expect(edge).toBeCloseTo(0.25);
    expect(edgeFilter(edge, MIN_EDGE).allowed).toBe(true);
  });

  it("positive NO-side edge below threshold → BLOCKED", () => {
    const edge = computeNoEdge(0.54, 0.60); // +6pp — below 10pp min
    expect(edge).toBeCloseTo(0.06);
    const result = edgeFilter(edge, MIN_EDGE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("below_min_edge");
  });

  it("negative NO-side edge → BLOCKED", () => {
    const edge = computeNoEdge(0.70, 0.55); // −15pp NO edge (model thinks YES is likely)
    expect(edge).toBeCloseTo(-0.15);
    const result = edgeFilter(edge, MIN_EDGE);
    expect(result.allowed).toBe(false);
  });
});

describe("edge filter — hard floor (5pp)", () => {
  const HARD_FLOOR = 0.05;

  it("edge above hard floor but below min passes hard floor check", () => {
    const edge = 0.07; // above 5pp floor, below 10pp configured min
    expect(edgeFilter(edge, HARD_FLOOR).allowed).toBe(true);
    expect(edgeFilter(edge, MIN_EDGE).allowed).toBe(false);
  });

  it("negative edge fails hard floor", () => {
    const edge = -0.30;
    expect(edgeFilter(edge, HARD_FLOOR).allowed).toBe(false);
  });
});

describe("Math.abs regression — bug that allowed negative-edge bets", () => {
  it("−30pp edge must be BLOCKED, not treated as +30pp", () => {
    const edge = -0.30;
    // Old (buggy) behaviour: Math.abs(-0.30) = 0.30 >= 0.10 → would allow
    const buggyResult = Math.abs(edge) >= MIN_EDGE;
    expect(buggyResult).toBe(true); // confirms the bug existed

    // Correct behaviour: −0.30 < 0.10 → block
    const correctResult = edgeFilter(edge, MIN_EDGE);
    expect(correctResult.allowed).toBe(false);
  });
});
