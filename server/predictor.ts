/**
 * Claude Predictor — Kalshi prediction market agent with multi-agent council debate
 * Mounted at /api/predictor/*
 */

import { Router } from "express";
import { pool } from "./db";
import crypto from "crypto";
import { ethers } from "ethers";
import { ClobClient } from "@polymarket/clob-client";
import { OrderType, Side } from "@polymarket/clob-client";

export const predictorRouter = Router();

// ── Kalshi API config ───────────────────────────────────────────────────────

const KALSHI_BASE = {
  demo: "https://demo-api.kalshi.co/trade-api/v2",
  prod: "https://api.elections.kalshi.com/trade-api/v2",
};

// New Kalshi API uses _dollars string fields; old used plain decimal numbers.
// This helper normalises to decimal 0–1 from either format.
function kPrice(mkt: any, field: string): number {
  const dollarField = `${field}_dollars`;
  if (mkt[dollarField] !== undefined) return parseFloat(mkt[dollarField]) || 0;
  if (mkt[field]        !== undefined) return parseFloat(mkt[field])        || 0;
  return 0;
}

// All categories are included — Claude decides where the edge is.
// We used to hard-filter here, which blocked crypto, climate, sports etc.
// Now every open Kalshi market is eligible for analysis.

// ── ONE-TIME BET MIGRATION ────────────────────────────────────────────────────
const DEV_BETS_MIGRATION = [
  {id:"KXMVESPORTSMULTIGAMEEXTENDED-S202636BD52C820F-217A06DC1E1-1775899539054",market_ticker:"KXMVESPORTSMULTIGAMEEXTENDED-S202636BD52C820F-217A06DC1E1",market_title:"24-leg MLB player props parlay",side:"no",contracts:50,price:0.5,cost:25,confidence:0.9,edge:-0.498,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"kalshi",logged_at:"2026-04-11 09:25:39.055+00"},
  {id:"KXAGICO-COMP-26Q2-1775987162022",market_ticker:"KXAGICO-COMP-26Q2",market_title:"Will any company announce AGI before Jul 1, 2026?",side:"no",contracts:10,price:0.87,cost:8.7,confidence:0.9,edge:-0.08,council_verdict:"BET_NO",status:"canceled",order_id:"b8a741b6-208c-44d3-b143-d096d6cb4ca6",platform:"kalshi",logged_at:"2026-04-12 09:46:02.023+00"},
  {id:"KXINSURRECTION-29-26MAY-1775987162095",market_ticker:"KXINSURRECTION-29-26MAY",market_title:"Will Trump invoke the Insurrection Act?",side:"yes",contracts:5,price:0.025,cost:0.125,confidence:0.5,edge:0.065,council_verdict:"BET_YES",status:"executed",order_id:"7d50ce7c-4cf9-4f47-b496-973dbaefcbcf",platform:"kalshi",logged_at:"2026-04-12 09:46:02.096+00"},
  {id:"KXZELENSKYPUTIN-29-26JUL-1775987162209",market_ticker:"KXZELENSKYPUTIN-29-26JUL",market_title:"Zelenskyy and Putin meet before Jul 1, 2026?",side:"no",contracts:4,price:0.88,cost:3.52,confidence:0.7,edge:-0.05,council_verdict:"BET_NO",status:"executed",order_id:"8a8b2d45-3f2b-4bfd-8e40-1e57e64ecdb6",platform:"kalshi",logged_at:"2026-04-12 09:46:02.209+00"},
  {id:"KXDEREMEROUT-26-MAY01-1776145553384",market_ticker:"KXDEREMEROUT-26-MAY01",market_title:"Chavez-DeRemer leaves Labor Secretary before May 2026",side:"no",contracts:7,price:0.73,cost:5.11,confidence:0.7,edge:-0.09,council_verdict:"BET_NO",status:"resting",order_id:"05fd546f-b522-4eb4-a2c4-aa9545446fc7",platform:"kalshi",logged_at:"2026-04-14 05:45:53.384+00"},
  {id:"KXDEREMERANNOUNCEOUT-26APR-MAY01-1776145553686",market_ticker:"KXDEREMERANNOUNCEOUT-26APR-MAY01",market_title:"Chavez-DeRemer announces departure before May 2026",side:"no",contracts:8,price:0.76,cost:6.08,confidence:0.7,edge:-0.12,council_verdict:"BET_NO",status:"resting",order_id:"598aab46-508a-41f3-8679-513cfc73938b",platform:"kalshi",logged_at:"2026-04-14 05:45:53.686+00"},
  {id:"KXKASHANNOUNCEOUT-26APR-MAY01-1776145553791",market_ticker:"KXKASHANNOUNCEOUT-26APR-MAY01",market_title:"Kash Patel announce departure as FBI Director before May 2026",side:"no",contracts:5,price:0.84,cost:4.2,confidence:0.7,edge:-0.07,council_verdict:"BET_NO",status:"resting",order_id:"7bcd4d01-0540-49a3-a4eb-22ca1e2c802f",platform:"kalshi",logged_at:"2026-04-14 05:45:53.791+00"},
  {id:"KXDEREMEROUT-26-MAY01-1776145583753",market_ticker:"KXDEREMEROUT-26-MAY01",market_title:"Will Chavez-DeRemer leave as Labor Secretary before May 2026?",side:"no",contracts:8,price:0.73,cost:5.84,confidence:0.7,edge:-0.11,council_verdict:"BET_NO",status:"resting",order_id:"715a6ba9-17ba-4b3e-afa1-c3608a6bbdbf",platform:"kalshi",logged_at:"2026-04-14 05:46:23.754+00"},
  {id:"KXDEREMERANNOUNCEOUT-26APR-MAY01-1776145583822",market_ticker:"KXDEREMERANNOUNCEOUT-26APR-MAY01",market_title:"Will Chavez-DeRemer announce departure as Labor Secretary before May 2026?",side:"no",contracts:8,price:0.76,cost:6.08,confidence:0.7,edge:-0.12,council_verdict:"BET_NO",status:"resting",order_id:"1f3907a2-aa63-4bdc-be47-c1057a1d40fe",platform:"kalshi",logged_at:"2026-04-14 05:46:23.822+00"},
  {id:"KXKASHANNOUNCEOUT-26APR-MAY01-1776145583879",market_ticker:"KXKASHANNOUNCEOUT-26APR-MAY01",market_title:"Will Kash Patel announce departure as FBI Director before May 2026?",side:"no",contracts:10,price:0.84,cost:8.4,confidence:0.9,edge:-0.09,council_verdict:"BET_NO",status:"resting",order_id:"82c54c7b-16f9-495a-a88f-1669131e2fe5",platform:"kalshi",logged_at:"2026-04-14 05:46:23.879+00"},
  {id:"KXKASHOUT-26APR-MAY01-1776153758316",market_ticker:"KXKASHOUT-26APR-MAY01",market_title:"Kash Patel leaves FBI Director before May 2026",side:"no",contracts:5,price:0.86,cost:4.3,confidence:0.7,edge:-0.06,council_verdict:"BET_NO",status:"resting",order_id:"e8ca4ad7-4ddc-46bd-a036-44c3f29677b6",platform:"kalshi",logged_at:"2026-04-14 08:02:38.316+00"},
  {id:"poly-will-bitcoin-reach-80k-in-april-2026-1776182755420",market_ticker:"will-bitcoin-reach-80k-in-april-2026",market_title:"Bitcoin reach $80K in April",side:"no",contracts:5,price:0.6,cost:3,confidence:0.7,edge:-0.08,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-14 16:05:55.420+00"},
  {id:"poly-iran-x-israelus-conflict-ends-by-april-30-766-662-668-546-1776182755541",market_ticker:"iran-x-israelus-conflict-ends-by-april-30-766-662-668-546",market_title:"Iran x Israel/US conflict ends by Apr 30",side:"no",contracts:5,price:0.19,cost:0.95,confidence:0.7,edge:-0.09,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-14 16:05:55.541+00"},
  {id:"KXLUTNICKANNOUNCEOUT-26APR-MAY01-1776218562977",market_ticker:"KXLUTNICKANNOUNCEOUT-26APR-MAY01",market_title:"Will Lutnick announce departure as Commerce Secretary before May 2026?",side:"no",contracts:5,price:0.87,cost:4.35,confidence:0.7,edge:-0.05,council_verdict:"BET_NO",status:"resting",order_id:"d84ccbb4-38aa-4e57-be3a-f95a69d47068",platform:"kalshi",logged_at:"2026-04-15 02:02:42.978+00"},
  {id:"KXGABBARDANNOUNCEOUT-26APR-MAY01-1776225779955",market_ticker:"KXGABBARDANNOUNCEOUT-26APR-MAY01",market_title:"Gabbard announce departure as DNI before May 1, 2026",side:"no",contracts:6,price:0.9,cost:5.4,confidence:0.9,edge:-0.06,council_verdict:"BET_NO",status:"resting",order_id:"8a737fe8-9d7b-403b-8b09-3bb22e1fff54",platform:"kalshi",logged_at:"2026-04-15 04:02:59.955+00"},
  {id:"poly-us-x-iran-permanent-peace-deal-by-april-22-2026-1776225780096",market_ticker:"us-x-iran-permanent-peace-deal-by-april-22-2026",market_title:"US-Iran peace deal by Apr 22",side:"no",contracts:15,price:0.755,cost:11.325,confidence:0.9,edge:-0.195,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 04:03:00.097+00"},
  {id:"poly-military-action-against-iran-ends-by-april-17-2026-1776232983941",market_ticker:"military-action-against-iran-ends-by-april-17-2026",market_title:"Military action against Iran ends by April 17",side:"no",contracts:10,price:0.0005,cost:0.005,confidence:0.7,edge:-0.0795,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 06:03:03.941+00"},
  {id:"poly-will-wti-crude-oil-wti-hit-high-110-in-april-1776240194245",market_ticker:"will-wti-crude-oil-wti-hit-high-110-in-april",market_title:"WTI hit $110 in April",side:"no",contracts:15,price:0.765,cost:11.475,confidence:0.9,edge:-0.205,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 08:03:14.246+00"},
  {id:"poly-strait-of-hormuz-traffic-returns-to-normal-by-april-30-1776247372681",market_ticker:"strait-of-hormuz-traffic-returns-to-normal-by-april-30",market_title:"Strait of Hormuz normal by end of April",side:"yes",contracts:5,price:0.245,cost:1.225,confidence:0.5,edge:0.105,council_verdict:"BET_YES",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 10:02:52.681+00"},
  {id:"poly-us-iran-nuclear-deal-by-april-30-1776254584990",market_ticker:"us-iran-nuclear-deal-by-april-30",market_title:"US-Iran nuclear deal by April 30",side:"no",contracts:12,price:0.685,cost:8.22,confidence:0.7,edge:-0.135,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 12:03:04.991+00"},
  {id:"poly-us-x-iran-permanent-peace-deal-by-april-30-2026-1776261784837",market_ticker:"us-x-iran-permanent-peace-deal-by-april-30-2026",market_title:"US x Iran permanent peace deal by Apr 30",side:"no",contracts:15,price:0.625,cost:9.375,confidence:0.9,edge:-0.315,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 14:03:04.837+00"},
  {id:"poly-iran-agrees-to-end-enrichment-of-uranium-by-april-30-1776261784967",market_ticker:"iran-agrees-to-end-enrichment-of-uranium-by-april-30",market_title:"Iran agrees to end uranium enrichment by Apr 30",side:"no",contracts:15,price:0.6955,cost:10.4325,confidence:0.9,edge:-0.2445,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-15 14:03:04.967+00"},
  {id:"poly-will-bitcoin-reach-80k-in-april-2026-1776319373154",market_ticker:"will-bitcoin-reach-80k-in-april-2026",market_title:"Bitcoin reach $80K in April",side:"yes",contracts:5,price:0.365,cost:1.825,confidence:0.5,edge:0.155,council_verdict:"BET_YES",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-16 06:02:53.154+00"},
  {id:"KXLUTNICKOUT-26MAY01-1776333779063",market_ticker:"KXLUTNICKOUT-26MAY01",market_title:"Will Howard Lutnick leave Commerce Secretary before May?",side:"yes",contracts:4,price:0.089,cost:0.356,confidence:0.5,edge:0.051,council_verdict:"BET_YES",status:"resting",order_id:"54b6f0b2-9fa0-4221-b94a-f78393d49526",platform:"kalshi",logged_at:"2026-04-16 10:02:59.064+00"},
  {id:"poly-us-x-iran-permanent-peace-deal-by-april-22-2026-1776333779198",market_ticker:"us-x-iran-permanent-peace-deal-by-april-22-2026",market_title:"US-Iran peace deal by April 22",side:"no",contracts:12,price:0.825,cost:9.9,confidence:0.9,edge:-0.125,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-16 10:02:59.199+00"},
  {id:"poly-iran-x-israelus-conflict-ends-by-april-30-766-662-668-546-1776391392047",market_ticker:"iran-x-israelus-conflict-ends-by-april-30-766-662-668-546",market_title:"Iran x Israel/US conflict ends by April 30",side:"no",contracts:10,price:0.11,cost:1.1,confidence:0.7,edge:-0.17,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 02:09:12.048+00"},
  {id:"poly-trump-announces-end-of-military-operations-against-iran-by-april-30th-753-882-164-769-641-926-1776398578232",market_ticker:"trump-announces-end-of-military-operations-against-iran-by-april-30th-753-882-164-769-641-926",market_title:"Trump ends military operations against Iran by Apr 30",side:"no",contracts:10,price:0.3235,cost:3.235,confidence:0.7,edge:-0.3635,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 04:02:58.232+00"},
  {id:"poly-us-x-iran-permanent-peace-deal-by-april-30-2026-1776398578506",market_ticker:"us-x-iran-permanent-peace-deal-by-april-30-2026",market_title:"US x Iran peace deal by April 30",side:"no",contracts:12,price:0.565,cost:6.78,confidence:0.9,edge:-0.365,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 04:02:58.506+00"},
  {id:"poly-will-wti-crude-oil-wti-hit-high-120-in-april-1776398578828",market_ticker:"will-wti-crude-oil-wti-hit-high-120-in-april",market_title:"WTI hit $120 in April",side:"no",contracts:15,price:0.83,cost:12.45,confidence:0.9,edge:-0.08,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 04:02:58.828+00"},
  {id:"poly-will-finland-win-eurovision-2026-1776405769638",market_ticker:"will-finland-win-eurovision-2026",market_title:"Finland win Eurovision 2026",side:"no",contracts:12,price:0.72,cost:8.64,confidence:0.7,edge:-0.27,council_verdict:"BET_NO",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 06:02:49.638+00"},
  {id:"poly-will-bitcoin-reach-80k-in-april-2026-1776412985307",market_ticker:"will-bitcoin-reach-80k-in-april-2026",market_title:"Bitcoin reach $80K in April",side:"yes",contracts:5,price:0.28,cost:1.4,confidence:0.5,edge:0.22,council_verdict:"BET_YES",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 08:09:45.308+00"},
  {id:"poly-strait-of-hormuz-traffic-returns-to-normal-by-april-30-1776420182628",market_ticker:"strait-of-hormuz-traffic-returns-to-normal-by-april-30",market_title:"Strait of Hormuz traffic returns to normal by April 30",side:"yes",contracts:5,price:0.24,cost:1.2,confidence:0.5,edge:0.11,council_verdict:"BET_YES",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-17 10:03:02.628+00"},
  {id:"KXGABBARDOUT-26-MAY01-1776585770921",market_ticker:"KXGABBARDOUT-26-MAY01",market_title:"Tulsi Gabbard leaves DNI before May 1, 2026",side:"yes",contracts:4,price:0.06,cost:0.24,confidence:0.5,edge:0.061,council_verdict:"BET_YES",status:"resting",order_id:null,platform:"kalshi",logged_at:"2026-04-19 08:02:50.922+00"},
  {id:"poly-will-bitcoin-reach-80k-in-april-2026-1776592974960",market_ticker:"will-bitcoin-reach-80k-in-april-2026",market_title:"Bitcoin reach $80K in April",side:"yes",contracts:10,price:0.325,cost:3.25,confidence:0.7,edge:0.125,council_verdict:"BET_YES",status:"failed",order_id:null,platform:"polymarket",logged_at:"2026-04-19 10:02:54.961+00"},
];

// Backfill missing market_title (and close_time) for Kalshi bets by querying
// the Kalshi public API. Runs at startup (capped) and on every Kalshi sync.
// Idempotent — only updates rows where market_title is null/empty/= ticker.
export async function backfillKalshiTitles(limit = 50): Promise<{ updated: number; checked: number }> {
  const summary = { updated: 0, checked: 0 };
  try {
    const r = await pool.query(
      `SELECT id, market_ticker, market_title, close_time
         FROM predictor_bets
        WHERE platform = 'kalshi'
          AND (market_title IS NULL OR market_title = '' OR market_title = market_ticker)
        ORDER BY logged_at DESC
        LIMIT $1`,
      [limit]
    );
    for (const bet of r.rows) {
      summary.checked++;
      try {
        const mkt = (await kalshiPublicReq(`/markets/${bet.market_ticker}`))?.market;
        const title = (mkt?.title || mkt?.subtitle || mkt?.yes_sub_title || "").toString().trim();
        const ct = mkt?.close_time || mkt?.expiration_time || null;
        const updates: string[] = [];
        const params: any[] = [];
        if (title && (!bet.market_title || bet.market_title === bet.market_ticker)) {
          params.push(title.slice(0, 500));
          updates.push(`market_title = $${params.length}`);
        }
        if (ct && !bet.close_time) {
          params.push(ct);
          updates.push(`close_time = $${params.length}`);
        }
        if (updates.length > 0) {
          params.push(bet.id);
          await pool.query(
            `UPDATE predictor_bets SET ${updates.join(', ')} WHERE id = $${params.length}`,
            params
          );
          summary.updated++;
        }
      } catch {}
    }
    if (summary.updated > 0) {
      console.log(`[predictor] backfillKalshiTitles: updated ${summary.updated}/${summary.checked}`);
    }
  } catch (e: any) {
    console.warn(`[predictor] backfillKalshiTitles error: ${e.message}`);
  }
  return summary;
}

async function importDevBetsOnce() {
  try {
    let imported = 0;
    for (const b of DEV_BETS_MIGRATION) {
      const r = await pool.query(
        `INSERT INTO predictor_bets
           (id, market_ticker, market_title, side, contracts, price, cost, confidence, edge,
            council_verdict, status, order_id, platform, logged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           contracts     = CASE WHEN predictor_bets.contracts = 0 THEN EXCLUDED.contracts ELSE predictor_bets.contracts END,
           price         = CASE WHEN predictor_bets.price     = 0 THEN EXCLUDED.price     ELSE predictor_bets.price     END,
           cost          = CASE WHEN predictor_bets.cost      = 0 THEN EXCLUDED.cost      ELSE predictor_bets.cost      END,
           market_title  = COALESCE(NULLIF(predictor_bets.market_title, ''), EXCLUDED.market_title),
           confidence    = COALESCE(predictor_bets.confidence, EXCLUDED.confidence),
           edge          = COALESCE(predictor_bets.edge, EXCLUDED.edge),
           council_verdict = COALESCE(predictor_bets.council_verdict, EXCLUDED.council_verdict)`,
        [b.id, b.market_ticker, b.market_title, b.side, b.contracts, b.price, b.cost,
         b.confidence, b.edge, b.council_verdict, b.status, b.order_id ?? null, b.platform, b.logged_at]
      );
      if (r.rowCount && r.rowCount > 0) imported++;
    }
    if (imported > 0) console.log(`[predictor] Imported ${imported} dev bet(s) into this database`);
  } catch (e: any) {
    console.warn(`[predictor] importDevBetsOnce skipped: ${e.message}`);
  }
}

// ── DB tables ────────────────────────────────────────────────────────────────

async function initPredictorTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_bets (
    id TEXT PRIMARY KEY,
    market_ticker TEXT,
    market_title TEXT,
    side TEXT,
    contracts INTEGER,
    price REAL,
    cost REAL,
    confidence REAL,
    edge REAL,
    council_verdict TEXT,
    council_transcript JSONB,
    status TEXT DEFAULT 'pending',
    order_id TEXT,
    pnl REAL,
    settled_at TIMESTAMPTZ,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Add order_id column to existing tables (safe if already exists)
  await pool.query(`ALTER TABLE predictor_bets ADD COLUMN IF NOT EXISTS order_id TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_scans (
    id SERIAL PRIMARY KEY,
    markets_scanned INTEGER DEFAULT 0,
    candidates_found INTEGER DEFAULT 0,
    bets_placed INTEGER DEFAULT 0,
    analyzed_tickers TEXT[] DEFAULT '{}',
    rounds INTEGER DEFAULT 1,
    result_summary TEXT,
    scan_json JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE predictor_scans ADD COLUMN IF NOT EXISTS analyzed_tickers TEXT[] DEFAULT '{}'`);
  await pool.query(`ALTER TABLE predictor_scans ADD COLUMN IF NOT EXISTS rounds INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE predictor_scans ADD COLUMN IF NOT EXISTS result_summary TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    type TEXT DEFAULT 'info',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_chat (
    id SERIAL PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_councils (
    id SERIAL PRIMARY KEY,
    market_ticker TEXT,
    market_title TEXT,
    our_probability REAL,
    market_probability REAL,
    edge REAL,
    verdict TEXT,
    confidence TEXT,
    transcript JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Add platform column to existing bets table
  await pool.query(`ALTER TABLE predictor_bets ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'kalshi'`);
  // Add outcome tracking columns
  await pool.query(`ALTER TABLE predictor_bets ADD COLUMN IF NOT EXISTS outcome TEXT`);
  await pool.query(`ALTER TABLE predictor_bets ADD COLUMN IF NOT EXISTS cost_usd REAL`);
  await pool.query(`ALTER TABLE predictor_bets ADD COLUMN IF NOT EXISTS close_time TIMESTAMPTZ`);

  // One-time migration: import dev bets that don't exist here yet
  await importDevBetsOnce();

  // Best-effort startup backfill of missing market_title — runs in background,
  // doesn't block init. Capped at 50 lookups per boot to keep startup fast.
  setTimeout(() => { backfillKalshiTitles(50).catch(() => {}); }, 5000);

  // Default settings
  const defaults: [string, string][] = [
    ["cron_enabled",            "false"],
    ["cron_interval_hours",     "2"],
    ["cron_last_run",           ""],
    ["min_edge",                "0.05"],
    ["max_bet_usd",             "25"],
    ["poly_max_bet_usd",        "20"],
    ["max_positions",           "10"],
    ["kelly_fraction",          "0.25"],
    ["mode",                    "demo"],
    ["time_horizon_days",       "30"],
    ["poly_enabled",            "true"],
    ["crypto_scan_enabled",       "false"],
    ["crypto_min_edge",           "0.12"],
    ["crypto_short_horizon_days", "7"],
    ["crypto_max_bet_usd",        "10"],
    ["crypto_kelly_fraction",     "0.15"],
    ["max_spread",                "0.12"],
    ["max_correlated_bets",       "2"],
    ["dynamic_edge",              "true"],
    ["risk_profile",              "balanced"],
  ];
  for (const [k, v] of defaults) {
    await pool.query(
      `INSERT INTO predictor_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [k, v]
    );
  }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM predictor_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await pool.query(
    `INSERT INTO predictor_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]
  );
}

async function insertLog(type: string, message: string) {
  await pool.query("INSERT INTO predictor_logs (type, message) VALUES ($1,$2)", [type, message]);
}

// ── Kalshi API helpers ───────────────────────────────────────────────────────

interface KalshiKeys {
  keyId: string;
  privateKey: string;
  isDemo: boolean;
}

export async function getKalshiKeys(): Promise<KalshiKeys> {
  // DB "mode" setting is the source of truth (controlled by the UI toggle).
  // Fall back to KALSHI_MODE env var, then default to "live" when live keys exist.
  const dbMode = await getSetting("mode").catch(() => null);
  const envMode = process.env.KALSHI_MODE;
  const hasLiveKeys = !!(process.env.KALSHI_KEY_ID_LIVE && process.env.KALSHI_PRIVATE_KEY_LIVE);
  const mode = dbMode || envMode || (hasLiveKeys ? "live" : "demo");
  const isDemo = mode === "demo";
  return {
    keyId: isDemo
      ? process.env.KALSHI_KEY_ID_DEMO || ""
      : process.env.KALSHI_KEY_ID_LIVE || "",
    privateKey: isDemo
      ? process.env.KALSHI_PRIVATE_KEY_DEMO || ""
      : process.env.KALSHI_PRIVATE_KEY_LIVE || "",
    isDemo,
  };
}

// Kalshi v2 uses RSA-PSS signing for auth. For the demo env, we use simple
// email/password login which returns a JWT. For production, implement RSA-PSS.
let kalshiToken: string | null = null;
let kalshiTokenExpiry = 0;

async function kalshiLogin(keys: KalshiKeys): Promise<string> {
  if (kalshiToken && Date.now() < kalshiTokenExpiry) return kalshiToken;

  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;

  // Demo uses email/password login
  if (keys.isDemo) {
    const email = process.env.KALSHI_EMAIL_DEMO || "";
    const password = process.env.KALSHI_PASSWORD_DEMO || "";
    if (!email || !password) throw new Error("Kalshi demo credentials not configured");

    const res = await fetch(`${base}/log-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Kalshi login failed: ${res.status}`);
    const d = await res.json();
    kalshiToken = d.token;
    kalshiTokenExpiry = Date.now() + 25 * 60 * 1000; // 25 min (tokens expire at 30)
    return kalshiToken!;
  }

  // Production: RSA-PSS signing (key-based auth)
  // For now, use API key headers directly
  kalshiToken = keys.keyId;
  return kalshiToken;
}

function normalisePem(raw: string): string {
  // Step 1: Replace literal \n sequences (common when pasting PEM into env vars)
  let pem = raw.replace(/\\n/g, "\n").trim();

  // Step 2: If no header at all, wrap as PKCS#8 (Kalshi default for new API keys)
  if (!pem.includes("-----BEGIN")) {
    const b64 = pem.replace(/\s+/g, "");
    const folded = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");
    return `-----BEGIN PRIVATE KEY-----\n${folded}\n-----END PRIVATE KEY-----\n`;
  }

  // Step 3: Always strip & re-fold — handles single-line PEM, wrong line lengths,
  //         spaces instead of newlines, etc.
  const typeMatch = pem.match(/-----BEGIN ([^-]+)-----/);
  const keyType   = typeMatch?.[1] ?? "PRIVATE KEY";

  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, ""); // strip ALL whitespace from body

  const folded = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");
  return `-----BEGIN ${keyType}-----\n${folded}\n-----END ${keyType}-----\n`;
}

function kalshiSign(privateKeyPem: string, timestamp: string, method: string, path: string): string {
  // Kalshi production auth: RSA-PSS with SHA-256
  // Message = timestamp + METHOD + /trade-api/v2 + path (no query string)
  const pathWithoutQuery = path.split("?")[0];
  const message = `${timestamp}${method.toUpperCase()}/trade-api/v2${pathWithoutQuery}`;

  const pem = normalisePem(privateKeyPem);

  // Parse into a KeyObject so Node handles PKCS#1 / PKCS#8 / legacy formats
  let keyObj: crypto.KeyObject;
  try {
    keyObj = crypto.createPrivateKey({ key: pem, format: "pem" });
  } catch (parseErr: any) {
    // Last-ditch attempt: try PKCS#1 RSA header
    try {
      const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
      const folded = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
      const pkcs1 = `-----BEGIN RSA PRIVATE KEY-----\n${folded}\n-----END RSA PRIVATE KEY-----\n`;
      keyObj = crypto.createPrivateKey({ key: pkcs1, format: "pem" });
    } catch {
      throw new Error(`Kalshi private key parse failed: ${parseErr.message}. Ensure KALSHI_PRIVATE_KEY_LIVE is a valid PEM private key.`);
    }
  }

  const sig = crypto.sign("sha256", Buffer.from(message), {
    key: keyObj,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return sig.toString("base64");
}

export async function kalshiReq(path: string, method = "GET", body: any = null): Promise<any> {
  const keys = await getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;

  let headers: any = { "Content-Type": "application/json" };

  if (keys.isDemo) {
    const token = await kalshiLogin(keys);
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Production: RSA-PSS signed requests
    const timestamp = String(Date.now());
    const signature = kalshiSign(keys.privateKey, timestamp, method, path);
    headers["KALSHI-ACCESS-KEY"]       = keys.keyId;
    headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp;
    headers["KALSHI-ACCESS-SIGNATURE"] = signature;
  }

  try {
    const res = await fetch(base + path, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

// Public endpoints (no auth needed for market data)
export async function kalshiPublicReq(path: string): Promise<any> {
  const keys = await getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  try {
    const res = await fetch(base + path, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

// ── Polymarket API helpers ───────────────────────────────────────────────────

const POLY_GAMMA = "https://gamma-api.polymarket.com";


export function getPolyCredentials() {
  const apiKey      = process.env.POLY_API_KEY        || "";
  const apiSecret   = process.env.POLY_API_SECRET     || "";
  const passphrase  = process.env.POLY_API_PASSPHRASE || "";
  const privateKey  = process.env.POLY_PRIVATE_KEY    || "";
  const funder      = process.env.POLY_FUNDER         || "";
  return { apiKey, apiSecret, passphrase, privateKey, funder };
}

// Build a fully-authenticated ClobClient using official @polymarket/clob-client
export async function getPolyClobClient(): Promise<ClobClient | null> {
  const { privateKey, apiKey, apiSecret, passphrase, funder } = getPolyCredentials();
  if (!privateKey) return null;

  // Strict format validation — reject UUIDs, bare hex, or anything non-EOA
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error(
      "[poly] POLY_PRIVATE_KEY is not a valid EOA private key (must be 0x + 64 hex chars). " +
      "Export the real key from MetaMask and update the secret. Live trading refused."
    );
  }
  if (funder && !/^0x[a-fA-F0-9]{40}$/.test(funder)) {
    throw new Error(
      "[poly] POLY_FUNDER is not a valid EOA address (must be 0x + 40 hex chars). " +
      "Update the secret to your MetaMask wallet address. Live trading refused."
    );
  }

  const pk = privateKey;
  const wallet = new ethers.Wallet(pk);
  const creds = (apiKey && apiSecret && passphrase)
    ? { key: apiKey, secret: apiSecret, passphrase }
    : undefined;
  const client = new ClobClient(
    "https://clob.polymarket.com",
    137,
    wallet as any,
    creds as any,
    0,
    funder || wallet.address,
  );
  // If we don't have creds yet, derive them on-the-fly
  if (!creds) {
    try {
      const derived = await client.createOrDeriveApiKey(0);
      (client as any).creds = derived;
    } catch (e: any) {
      console.error("[poly] credential derivation failed:", e.message);
      return null;
    }
  }
  return client;
}

// ── Legacy modelfarm/Replit Claude SDK pipeline removed ─────────────────────
// Routine-side pipeline now lives in predictor-agent.ts. The dead Anthropic
// init pointing at localhost:1106 (Replit modelfarm) and its pipeline helpers
// (scanPolymarketMarkets, callClaude/Fast, fetchRecentNews, fetchCryptoContext,
// scanCryptoShortTermMarkets, runCryptoPipeline, scanMarkets, deepResearch,
// runCouncilDebate, executeBet, executePolyBet, runPredictorPipeline, saveScan)
// were removed in the W3 cleanup pass. Live helpers below (detectCluster,
// checkResolutions) survive because /why-no-bets and /check-resolutions still
// rely on them.

// ── Topic clustering ─────────────────────────────────────────────────────────
// Used by /why-no-bets to count "correlated" open bets per cluster so the
// diagnostic can explain when the cluster cap is what's blocking new entries.

const TOPIC_CLUSTERS: [RegExp, string][] = [
  [/election|primary|caucus|senate|house.race|governor/i, "us-elections"],
  [/fed|fomc|rate.cut|rate.hike|powell|jerome.powell/i, "fed-rates"],
  [/bitcoin|btc|ethereum|eth|crypto|altcoin/i, "crypto"],
  [/russia|ukraine|putin|kyiv|moscow/i, "russia-ukraine"],
  [/china|taiwan|xi.jinping|beijing|pla|south.china.sea/i, "china-taiwan"],
  [/israel|gaza|hamas|netanyahu|west.bank|hezbollah/i, "israel-gaza"],
  [/north.korea|kim.jong|pyongyang/i, "north-korea"],
  [/ai\b|artificial.intel|openai|anthropic|gpt|llm/i, "ai-tech"],
];

function detectCluster(title: string): string {
  for (const [pattern, cluster] of TOPIC_CLUSTERS) {
    if (pattern.test(title)) return cluster;
  }
  return "other";
}

// ── Resolution tracker ───────────────────────────────────────────────────────
// Checks Kalshi for settled markets, marks won/lost in predictor_bets, and
// records P&L. Called by POST /check-resolutions (admin trigger) and by the
// post-routine resolution sweep.

async function checkResolutions(): Promise<{ checked: number; resolved: number; errors: number }> {
  const result = { checked: 0, resolved: 0, errors: 0 };
  try {
    const unresolved = await pool.query(
      `SELECT id, market_ticker, side, contracts, price, cost, cost_usd, platform
       FROM predictor_bets
       WHERE outcome IS NULL
         AND status NOT IN ('cancelled','canceled','failed')
         AND platform = 'kalshi'`
    );
    result.checked = unresolved.rows.length;

    for (const bet of unresolved.rows) {
      try {
        const mkt = await kalshiPublicReq(`/markets/${bet.market_ticker}`);
        const market = mkt?.market;
        if (!market) continue;

        const status = market.status;
        if (status !== "finalized" && status !== "settled") continue;

        const result_value = market.result; // "yes" or "no"
        if (!result_value) continue;

        const won = result_value === bet.side;
        const outcome = won ? "won" : "lost";

        const costUsd = bet.cost_usd ?? bet.cost ?? 0;
        const pnl = won
          ? parseFloat(((bet.contracts ?? 0) * (1 - (bet.price ?? 0))).toFixed(2))
          : -parseFloat(costUsd.toFixed(2));

        await pool.query(
          `UPDATE predictor_bets
           SET outcome = $1, pnl = $2, settled_at = NOW(), status = 'settled'
           WHERE id = $3`,
          [outcome, pnl, bet.id]
        );
        await insertLog("info", `[resolution] ${bet.market_ticker} → ${outcome} | P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
        result.resolved++;
      } catch {
        result.errors++;
      }
    }
  } catch (e: any) {
    await insertLog("error", `[resolution] ERROR: ${e.message}`);
  }
  return result;
}

// ── Routes ──────────────────────────────────────────────────────────────────

// Risk profile presets — map a single profile choice to the four numeric
// gates the executor reads. Changing the profile updates all four settings
// atomically; the predictor reads them on each fire so changes take effect
// next run with no restart.
const RISK_PROFILES = {
  conservative: { min_edge: "0.08", max_bet_usd: "10", max_positions: "5",  max_correlated_bets: "1", kelly_fraction: "0.15" },
  balanced:     { min_edge: "0.05", max_bet_usd: "25", max_positions: "10", max_correlated_bets: "2", kelly_fraction: "0.25" },
  aggressive:   { min_edge: "0.03", max_bet_usd: "50", max_positions: "20", max_correlated_bets: "4", kelly_fraction: "0.40" },
} as const;
type RiskProfile = keyof typeof RISK_PROFILES;

predictorRouter.get("/risk-profile", async (_req, res) => {
  try {
    const profile = (await getSetting("risk_profile")) || "balanced";
    const [minEdge, maxBet, maxPos, maxCorr, kelly] = await Promise.all([
      getSetting("min_edge"),
      getSetting("max_bet_usd"),
      getSetting("max_positions"),
      getSetting("max_correlated_bets"),
      getSetting("kelly_fraction"),
    ]);
    res.json({
      profile,
      presets: RISK_PROFILES,
      currentSettings: {
        min_edge: minEdge,
        max_bet_usd: maxBet,
        max_positions: maxPos,
        max_correlated_bets: maxCorr,
        kelly_fraction: kelly,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.post("/risk-profile", async (req, res) => {
  try {
    const profile = String(req.body?.profile || "").toLowerCase() as RiskProfile;
    if (!RISK_PROFILES[profile]) {
      return res.status(400).json({
        error: "profile must be one of: conservative, balanced, aggressive",
      });
    }
    const preset = RISK_PROFILES[profile];
    // Persist profile + each derived setting in one transaction-ish loop.
    // setSetting upserts so order doesn't matter.
    await pool.query(
      `INSERT INTO predictor_settings (key, value) VALUES ('risk_profile', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [profile]
    );
    for (const [k, v] of Object.entries(preset)) {
      await pool.query(
        `INSERT INTO predictor_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [k, v]
      );
    }
    res.json({ profile, applied: preset });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Diagnostic — answers "why hasn't the agent placed a bet recently?" by
// returning the live state of every gate the executor checks. Surfaces
// the most common silent blockers: cluster cap saturation from stale
// resting bets, position cap, and recent PASS verdicts.
predictorRouter.get("/why-no-bets", async (_req, res) => {
  try {
    const [maxPositions, maxCorrelated, minEdge, dynamicEdge] = await Promise.all([
      getSetting("max_positions").then(v => parseInt(v || "10")),
      getSetting("max_correlated_bets").then(v => parseInt(v || "2")),
      getSetting("min_edge").then(v => parseFloat(v || "0.05")),
      getSetting("dynamic_edge").then(v => v !== "false"),
    ]);

    const openBets = (await pool.query(
      `SELECT id, market_ticker, market_title, side, status, logged_at
         FROM predictor_bets
        WHERE status NOT IN ('cancelled','canceled','failed','settled')
        ORDER BY logged_at DESC`
    )).rows;

    // Group by cluster and flag saturated clusters that block new bets.
    const clusterCounts: Record<string, number> = {};
    const clusterSamples: Record<string, string[]> = {};
    for (const b of openBets) {
      const c = detectCluster(b.market_title || "");
      if (c === "other") continue;
      clusterCounts[c] = (clusterCounts[c] || 0) + 1;
      clusterSamples[c] = clusterSamples[c] || [];
      if (clusterSamples[c].length < 3) clusterSamples[c].push(b.market_ticker);
    }
    const saturatedClusters = Object.entries(clusterCounts)
      .filter(([, n]) => n >= maxCorrelated)
      .map(([cluster, count]) => ({ cluster, count, sampleTickers: clusterSamples[cluster] }));

    // Resting bets older than 7 days are stale candidates for cleanup.
    const staleResting = openBets.filter(b =>
      b.status === "resting" &&
      Date.parse(b.logged_at) < Date.now() - 7 * 86400000
    );

    // Last 24h council activity — what verdict ratio?
    const recent = (await pool.query(
      `SELECT verdict, COUNT(*)::int AS n
         FROM predictor_councils
        WHERE logged_at > NOW() - INTERVAL '24 hours'
        GROUP BY verdict`
    )).rows;
    const verdictBreakdown: Record<string, number> = {};
    for (const r of recent) verdictBreakdown[r.verdict] = r.n;

    // Last fire summary (predictor_scans is the run audit log).
    const lastRun = (await pool.query(
      `SELECT logged_at, markets_scanned, candidates_found, bets_placed, rounds, result_summary
         FROM predictor_scans
        ORDER BY logged_at DESC LIMIT 1`
    )).rows[0] || null;

    const blockers: string[] = [];
    if (saturatedClusters.length > 0) {
      blockers.push(
        `${saturatedClusters.length} cluster(s) saturated at the ${maxCorrelated}-bet cap: ` +
        saturatedClusters.map(s => `${s.cluster} (${s.count})`).join(", ") +
        ". New markets in these clusters auto-skip until existing bets resolve or are cancelled."
      );
    }
    if (openBets.length >= maxPositions) {
      blockers.push(`Position cap hit: ${openBets.length}/${maxPositions} open bets.`);
    }
    if (staleResting.length > 0) {
      blockers.push(
        `${staleResting.length} resting bet(s) older than 7 days — likely never filled and ` +
        `still consuming cluster slots. Consider cancelling: ` +
        staleResting.slice(0, 5).map(b => b.market_ticker).join(", ") +
        (staleResting.length > 5 ? `, +${staleResting.length - 5} more` : "")
      );
    }
    if ((verdictBreakdown.PASS || 0) > 0 && (verdictBreakdown.BET_YES || 0) + (verdictBreakdown.BET_NO || 0) === 0) {
      blockers.push(
        `Last 24h council verdicts: ${verdictBreakdown.PASS} PASS, 0 BET. ` +
        `Either no edge available right now or the ${(minEdge * 100).toFixed(0)}pp floor is too tight.`
      );
    }
    if (blockers.length === 0) {
      blockers.push("No obvious blockers — agent should be placing bets when fired. Check that the cron is actually running.");
    }

    res.json({
      gates: { maxPositions, maxCorrelated, minEdge, dynamicEdge },
      openBets: { count: openBets.length, sample: openBets.slice(0, 10) },
      clusterCounts,
      saturatedClusters,
      staleResting: staleResting.map(b => ({
        id: b.id, ticker: b.market_ticker, title: b.market_title,
        status: b.status, ageDays: Math.floor((Date.now() - Date.parse(b.logged_at)) / 86400000),
      })),
      last24hVerdicts: verdictBreakdown,
      lastRun,
      blockers,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel resting bets older than N days (default 7). Frees up cluster
// slots so the agent can place new bets. POST body: { olderThanDays?: number }
predictorRouter.post("/cancel-stale-resting", async (req, res) => {
  try {
    const olderThanDays = Math.max(1, parseInt(String(req.body?.olderThanDays ?? "7"), 10) || 7);
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const stale = (await pool.query(
      `SELECT id, market_ticker, order_id
         FROM predictor_bets
        WHERE status = 'resting' AND order_id IS NOT NULL AND logged_at < $1`,
      [cutoff]
    )).rows;

    let cancelled = 0;
    const failures: any[] = [];
    for (const bet of stale) {
      try {
        await kalshiReq(`/portfolio/orders/${bet.order_id}`, "DELETE");
        await pool.query(
          `UPDATE predictor_bets SET status = 'cancelled' WHERE id = $1`,
          [bet.id]
        );
        cancelled++;
      } catch (e: any) {
        failures.push({ id: bet.id, ticker: bet.market_ticker, error: e.message });
      }
    }
    res.json({ found: stale.length, cancelled, failures, olderThanDays });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.get("/health", async (_req, res) => {
  const keys = await getKalshiKeys();
  res.json({
    status: "ok",
    module: "predictor",
    kalshi_mode: keys.isDemo ? "demo" : "live",
    has_kalshi_creds: keys.isDemo
      ? !!(process.env.KALSHI_EMAIL_DEMO && process.env.KALSHI_PASSWORD_DEMO)
      : !!(keys.keyId && keys.privateKey),
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Key format diagnostics — never logs the key value
predictorRouter.get("/key-check", async (_req, res) => {
  const keys = await getKalshiKeys();
  if (keys.isDemo) return res.json({ mode: "demo", note: "Key check only applies to live mode" });

  const raw = keys.privateKey;
  if (!raw) return res.json({ ok: false, error: "KALSHI_PRIVATE_KEY_LIVE is not set" });

  const normalised = normalisePem(raw);
  const header = normalised.match(/-----BEGIN ([^-]+)-----/)?.[1] ?? "UNKNOWN";
  const lineCount = normalised.split("\n").length;
  const byteLen = Buffer.from(raw).length;

  let parseResult = "ok";
  let keyType = "unknown";
  try {
    const k = crypto.createPrivateKey({ key: normalised, format: "pem" });
    keyType = k.asymmetricKeyType ?? "unknown";
  } catch (e: any) {
    parseResult = e.message;
  }

  res.json({
    ok: parseResult === "ok",
    detected_header: header,
    key_type: keyType,
    raw_byte_length: byteLen,
    normalised_lines: lineCount,
    has_headers: raw.includes("-----"),
    has_literal_newlines: raw.includes("\\n"),
    parse_result: parseResult,
  });
});

// Proxy for Kalshi public market data (CORS workaround)
predictorRouter.get("/markets", async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "100"), 1000);
    const status = (req.query.status as string) || "open";
    // KXMVE = Kalshi multi-leg parlay markets (sports compounds). They flood
    // the default sort and are almost never tradeable for a research-driven
    // agent (every leg multiplies edge requirements; liquidity is thin). Skip
    // by default; pass ?include_parlays=true to include them.
    const includeParlays = req.query.include_parlays === "true";

    if (includeParlays) {
      const data = await kalshiPublicReq(`/markets?status=${status}&limit=${Math.min(limit, 1000)}`);
      return res.json(data);
    }

    // Paginate Kalshi until we accumulate `limit` non-parlay markets, capped
    // at 10 page-fetches (5000 raw markets) to bound cost.
    //
    // If a SINGLE page errors (Kalshi rate-limit, transient blip), we used
    // to 502 the whole request — even when earlier pages already succeeded.
    // That made the predictor routine fail catastrophically on every
    // intermittent Kalshi hiccup. Now: log + break out, return what we
    // collected. Only 502 if EVERY page fails AND we have zero markets.
    const collected: any[] = [];
    let cursor: string | undefined;
    let totalScanned = 0;
    let lastError: string | null = null;
    let pagesAttempted = 0;
    const PAGE_SIZE = 500;
    const MAX_PAGES = 10;
    for (let i = 0; i < MAX_PAGES && collected.length < limit; i++) {
      pagesAttempted++;
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const data: any = await kalshiPublicReq(`/markets?status=${status}&limit=${PAGE_SIZE}${cursorParam}`);
      if (data?.error) {
        lastError = data.message || "Kalshi proxy error";
        console.warn(`[predictor /markets] Kalshi page ${i + 1} failed: ${lastError} — returning ${collected.length} collected so far`);
        break;
      }
      const ms: any[] = Array.isArray(data?.markets) ? data.markets : [];
      totalScanned += ms.length;
      for (const m of ms) {
        const t: string = m?.ticker || "";
        if (t.startsWith("KXMVE")) continue; // parlay
        collected.push(m);
        if (collected.length >= limit) break;
      }
      cursor = data?.cursor;
      if (!cursor || ms.length === 0) break;
    }

    if (collected.length === 0 && lastError) {
      // Every attempt failed AND we collected nothing — only now is it a
      // real outage worth surfacing as 502.
      return res.status(502).json({ error: lastError });
    }

    res.json({
      markets: collected,
      cursor: null,
      meta: {
        scanned: totalScanned,
        returned: collected.length,
        pagesAttempted,
        filter: "KXMVE parlays excluded — pass ?include_parlays=true to include",
        ...(lastError ? { warning: `partial result — Kalshi errored on a later page: ${lastError}` } : {}),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get Kalshi account / balance
predictorRouter.get("/account", async (_req, res) => {
  try {
    const data = await kalshiReq("/portfolio/balance");
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get active positions
predictorRouter.get("/positions", async (_req, res) => {
  try {
    const data = await kalshiReq("/portfolio/positions?settlement_status=unsettled");
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// USDC contract on Polygon mainnet (USDC.e bridged, 6 decimals)
const POLYGON_USDC   = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const POLYGON_USDC2  = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // native USDC
const USDC_ABI       = ["function balanceOf(address) view returns (uint256)"];
const POLYGON_RPCS   = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://1rpc.io/matic",
  "https://polygon-rpc.com",
];

// Polymarket CTF Exchange on Polygon (holds deposited USDC collateral)
const POLY_CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
// Negative risk adapter (newer Polymarket architecture)
const POLY_NEG_RISK    = "0xd91E80cF2C8E3feC69Bf84E18F26E0D8e6b0Bca";

// ERC-1155 balanceOf for CTF Exchange collateral positions
const CTF_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function getCollateralToken() view returns (address)",
];
// Simple ERC-20 balanceOf
const ERC20_ABI_FULL = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

async function getPolyUSDCBalance(funderAddress: string): Promise<{ balance: number; source: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      let total = 0;

      // 1. Check USDC.e and native USDC directly in the wallet
      for (const [label, usdcAddr] of [["USDC.e", POLYGON_USDC], ["nUSDC", POLYGON_USDC2]] as [string, string][]) {
        try {
          const c = new ethers.Contract(usdcAddr, ERC20_ABI_FULL, provider);
          const raw: ethers.BigNumber = await Promise.race([
            c.balanceOf(funderAddress),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("t/o")), 5000)),
          ]) as ethers.BigNumber;
          const amt = parseFloat(ethers.utils.formatUnits(raw, 6));
          if (amt > 0) { total += amt; console.log(`[poly-balance] ${label} in wallet: ${amt}`); }
        } catch (e: any) { console.log(`[poly-balance] ${label} check failed: ${e.message}`); }
      }

      // 2. Check USDC.e allowance granted to CTF exchange (indicates how much the wallet has approved for trading)
      //    Also check if the proxy wallet has any USDC allowance to the CLOB
      for (const usdcAddr of [POLYGON_USDC, POLYGON_USDC2]) {
        try {
          const c = new ethers.Contract(usdcAddr, ERC20_ABI_FULL, provider);
          const raw: ethers.BigNumber = await Promise.race([
            c.balanceOf(POLY_CTF_EXCHANGE),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("t/o")), 5000)),
          ]) as ethers.BigNumber;
          // This is the total CTF exchange balance - not user-specific, skip
        } catch {}
      }

      if (total > 0) return { balance: total, source: "wallet" };
      console.log(`[poly-balance] wallet USDC=0 for ${funderAddress?.slice(0,8)}…, trying next RPC`);
      return { balance: 0, source: "wallet-empty" };
    } catch (e: any) { console.log(`[poly-balance] RPC ${rpc} failed: ${e.message}`); }
  }
  return { balance: 0, source: "rpc-failed" };
}

// Polymarket USDC balance
predictorRouter.get("/poly-balance", async (_req, res) => {
  try {
    const { funder } = getPolyCredentials();

    // Strategy 1: CLOB API via official ClobClient
    let clobBalance: number | null = null;
    try {
      const clobClient = await getPolyClobClient();
      if (clobClient) {
        // Try signature_type 1 (POLY_PROXY — used by Magic/email wallets) first, then fall back to 0 (EOA)
        let bestBalance = 0;
        for (const sigType of [1, 0, 2]) {
          try {
            const balResp = await clobClient.getBalanceAllowance({ asset_type: "COLLATERAL" as any, signature_type: sigType });
            console.log(`[poly-balance] sig_type=${sigType}:`, JSON.stringify(balResp));
            const item = Array.isArray(balResp) ? balResp[0] : balResp;
            const bal = parseFloat((item as any)?.balance ?? 0);
            if (bal > bestBalance) bestBalance = bal;
          } catch (e: any) { console.log(`[poly-balance] sig_type=${sigType} error: ${e.message}`); }
        }
        clobBalance = bestBalance;
      }
    } catch (e: any) { console.log(`[poly-balance] CLOB error: ${e.message}`); }

    if (!funder && clobBalance == null) return res.json({ usdc_balance: 0, error: "No Polymarket credentials" });

    // Strategy 2: Polygon blockchain — check wallet USDC balance
    const { balance: chainBalance, source: chainSource } = funder ? await getPolyUSDCBalance(funder) : { balance: 0, source: "no-funder" };

    // clob = USDC available for trading; chain = USDC held in wallet on Polygon
    const clobAvailable = clobBalance ?? 0;
    const totalVisible  = Math.max(clobAvailable, chainBalance); // show the highest visible balance
    console.log(`[poly-balance] final: CLOB=${clobBalance} chain=${chainBalance}`);

    // Determine wallet funding status for UI guidance
    const walletStatus = clobAvailable > 0
      ? "funded"            // USDC is live in Polymarket and ready to trade
      : chainBalance > 0
        ? "unfunded"        // USDC is on-chain but not yet deposited to Polymarket
        : "needs_deposit";  // wallet has no USDC anywhere

    // Get all polymarket bets from DB (including failed — shown separately in UI)
    const openBets = await pool.query(
      `SELECT id, market_ticker, market_title, side, contracts, price, cost, status, pnl, logged_at, order_id
       FROM predictor_bets
       WHERE platform='polymarket' AND status NOT IN ('cancelled','canceled','settled')
       ORDER BY logged_at DESC`
    );
    // Deduplicate by ticker — group multiple wagers on the same market
    const tickerMap = new Map<string, any>();
    for (const b of openBets.rows) {
      const cost = parseFloat(b.cost) || 0;
      const price = parseFloat(b.price) || 0;
      const contracts = parseFloat(b.contracts) || 0;
      const maxPay = price > 0 ? cost / price : contracts;
      const isFailed = b.status === "failed";
      if (tickerMap.has(b.market_ticker)) {
        const ex = tickerMap.get(b.market_ticker)!;
        if (!isFailed) { ex.cost_usd += cost; ex.max_payout_usd += maxPay; ex.potential_profit = ex.max_payout_usd - ex.cost_usd; ex.contracts += contracts; }
        ex.wagers.push({ side: b.side, contracts, price, cost, status: b.status, logged_at: b.logged_at });
      } else {
        tickerMap.set(b.market_ticker, {
          ticker: b.market_ticker, title: b.market_title, side: b.side, contracts: isFailed ? 0 : contracts,
          price, cost_usd: isFailed ? 0 : cost, max_payout_usd: isFailed ? 0 : maxPay,
          potential_profit: isFailed ? 0 : (maxPay - cost), status: b.status, logged_at: b.logged_at, order_id: b.order_id,
          all_failed: isFailed,
          wagers: [{ side: b.side, contracts, price, cost, status: b.status, logged_at: b.logged_at }],
        });
      }
    }
    const positions = Array.from(tickerMap.values());
    const activePositions = positions.filter((p: any) => !p.all_failed);
    const atStake    = activePositions.reduce((s: number, p: any) => s + (p.cost_usd || 0), 0);
    const maxPayout  = activePositions.reduce((s: number, p: any) => s + (p.max_payout_usd || 0), 0);
    const potProfit  = activePositions.reduce((s: number, p: any) => s + (p.potential_profit || 0), 0);
    res.json({
      usdc_balance:     totalVisible,    // on-chain wallet balance (what they have)
      clob_balance:     clobAvailable,   // USDC deposited and ready to trade on CLOB
      chain_balance:    chainBalance,    // raw on-chain balance
      at_stake:         atStake,
      max_payout:       maxPayout,
      potential_profit: potProfit,
      open_count:       positions.length,
      positions,
      funder_address:   funder || null,
      wallet_status:    walletStatus,
    });
  } catch (e: any) {
    res.json({ usdc_balance: 0, error: e.message });
  }
});

// Portfolio — balance + enriched active positions with payout calculations
predictorRouter.get("/portfolio", async (_req, res) => {
  try {
    const [balData, posData] = await Promise.all([
      kalshiReq("/portfolio/balance"),
      kalshiReq("/portfolio/positions?settlement_status=unsettled"),
    ]);

    // Kalshi returns market_positions (v2) or positions (older) — handle both
    const rawPositions: any[] = posData?.market_positions || posData?.positions || [];

    // Kalshi v2 uses yes_contracts_owned / no_contracts_owned fields
    // Filter: keep positions where we hold any contracts
    const active = rawPositions.filter((p: any) => {
      const yes = p.yes_contracts_owned ?? 0;
      const no  = p.no_contracts_owned  ?? 0;
      const legacy = p.position;
      return yes > 0 || no > 0 || (legacy != null && legacy !== 0);
    });

    // Enrich each active position with current market data
    const positions: any[] = [];
    for (const p of active) {
      let mkt: any = {};
      try { mkt = (await kalshiPublicReq(`/markets/${p.ticker}`))?.market || {}; } catch {}

      // Support both v2 (yes_contracts_owned/no_contracts_owned) and legacy (position field)
      const yesContracts = p.yes_contracts_owned ?? 0;
      const noContracts  = p.no_contracts_owned  ?? 0;
      const legacyPos    = p.position ?? 0;
      const contracts    = yesContracts > 0 ? yesContracts : noContracts > 0 ? noContracts : Math.abs(legacyPos);
      const side         = yesContracts > 0 ? "yes" : noContracts > 0 ? "no" : (legacyPos > 0 ? "yes" : "no");

      // market_exposure from Kalshi is in cents (old API) or may be in dollars (new API)
      const rawExposure  = p.market_exposure ?? p.total_cost ?? p.exposure ?? 0;
      // Heuristic: if value > 500, it's in cents; if ≤ 500 treat as dollars
      const costUSD      = rawExposure > 500 ? rawExposure / 100 : rawExposure;
      const maxPayoutUSD = contracts * 1.0; // $1 per contract if we win
      const potentialProfitUSD = maxPayoutUSD - costUSD;
      // Current bid price (decimal 0–1) — support both old and new field names
      const bidPrice     = side === "yes" ? kPrice(mkt, "yes_bid") : kPrice(mkt, "no_bid");
      const currentValueUSD = contracts * bidPrice;
      const unrealisedPnlUSD = currentValueUSD - costUSD;

      positions.push({
        ticker:               p.ticker,
        title:                mkt.title || p.ticker,
        side,
        contracts,
        cost_usd:             costUSD,
        max_payout_usd:       maxPayoutUSD,
        potential_profit_usd: potentialProfitUSD,
        current_value_usd:    currentValueUSD,
        unrealised_pnl_usd:   unrealisedPnlUSD,
        yes_ask:              kPrice(mkt, "yes_ask"),
        no_ask:               kPrice(mkt, "no_ask"),
        yes_bid:              kPrice(mkt, "yes_bid"),
        no_bid:               kPrice(mkt, "no_bid"),
        close_time:           mkt.close_time || mkt.expiration_time,
        status:               mkt.status,
        _raw_yes:             yesContracts,
        _raw_no:              noContracts,
      });
    }

    // Balance field names differ between Kalshi API versions — handle both
    const bal = balData?.balance ?? balData;
    const availableUSD      = typeof bal === "object" ? (bal.balance ?? bal.available_balance ?? 0) / 100 : Number(bal) / 100;
    const totalDepositedUSD = typeof bal === "object" ? (bal.total_deposited ?? 0) / 100 : 0;

    const pendingMap = new Map<string, any>();

    // PRIMARY: DB is the source of truth for all pending/open bets — it has the actual cost
    // at the moment each bet was placed. We build this FIRST, before touching Kalshi positions.
    const dbOpenBets = await pool.query(
      `SELECT market_ticker, market_title, side, contracts, price, cost, status, order_id
       FROM predictor_bets
       WHERE status NOT IN ('cancelled','canceled','failed','filled') AND pnl IS NULL
       ORDER BY logged_at DESC`
    );
    // Build a cost map from DB: ticker → total cost (sum of all wagers on same market)
    const dbCostMap = new Map<string, number>();
    for (const b of dbOpenBets.rows) {
      const c = parseFloat(b.cost) || 0;
      dbCostMap.set(b.market_ticker, (dbCostMap.get(b.market_ticker) || 0) + c);
    }

    // Patch Kalshi positions that have zero cost — use DB cost instead
    // This happens when Kalshi reports partially-executed orders as "positions" but
    // doesn't return the market_exposure (cost) field reliably.
    for (const pos of positions) {
      if (pos.cost_usd === 0 && dbCostMap.has(pos.ticker)) {
        pos.cost_usd             = dbCostMap.get(pos.ticker)!;
        pos.potential_profit_usd = pos.max_payout_usd - pos.cost_usd;
        pos.unrealised_pnl_usd   = pos.current_value_usd - pos.cost_usd;
      }
    }

    // positionTickers = ALL live Kalshi positions (used to avoid double-counting in secondary fetch)
    const positionTickers         = new Set(positions.map((p: any) => p.ticker));
    const pricedPositionTickers   = new Set(positions.filter((p: any) => p.cost_usd > 0).map((p: any) => p.ticker));
    const totalAtStakeUSD         = positions.reduce((s, p) => s + (p.cost_usd || 0), 0);
    const totalMaxPayoutUSD       = positions.reduce((s, p) => s + (p.max_payout_usd || 0), 0);
    const totalPotentialProfitUSD = positions.reduce((s, p) => s + (p.potential_profit_usd || 0), 0);

    for (const b of dbOpenBets.rows) {
      // Skip if already properly accounted for in Kalshi positions (cost > 0)
      if (pricedPositionTickers.has(b.market_ticker)) continue;
      const costUSD      = parseFloat(b.cost) || 0;
      const maxPayoutUSD = (parseFloat(b.contracts) || 0) * 1.0;
      const existing     = pendingMap.get(b.market_ticker);
      if (existing) {
        existing.cost_usd             += costUSD;
        existing.max_payout_usd       += maxPayoutUSD;
        existing.potential_profit_usd  = existing.max_payout_usd - existing.cost_usd;
        existing.contracts            += parseFloat(b.contracts) || 0;
        existing.wagers               = (existing.wagers || []).concat({ side: b.side, contracts: parseFloat(b.contracts) || 0, price: parseFloat(b.price) || 0, cost: costUSD, status: b.status, order_id: b.order_id });
        continue;
      }
      pendingMap.set(b.market_ticker, {
        ticker:               b.market_ticker,
        title:                b.market_title || b.market_ticker,
        side:                 b.side,
        contracts:            parseFloat(b.contracts) || 0,
        price:                parseFloat(b.price) || 0,
        cost_usd:             costUSD,
        max_payout_usd:       maxPayoutUSD,
        potential_profit_usd: maxPayoutUSD - costUSD,
        status:               b.status,
        order_id:             b.order_id,
        is_pending:           true,
        wagers:               [{ side: b.side, contracts: parseFloat(b.contracts) || 0, price: parseFloat(b.price) || 0, cost: costUSD, status: b.status, order_id: b.order_id }],
      });
    }

    // SECONDARY: Pull open Kalshi orders to catch bets placed outside this environment
    // (e.g. from dev placed on live Kalshi, showing on production). Don't override DB entries.
    // We check resting + executed statuses since Kalshi uses "executed" for in-book orders.
    try {
      const openOrders: any[] = [];
      for (const statusFilter of ["resting", "executed"]) {
        const data = await kalshiReq(`/portfolio/orders?status=${statusFilter}&limit=50`, "GET");
        (data?.orders || []).forEach((o: any) => {
          if (!openOrders.find((x: any) => x.order_id === o.order_id)) openOrders.push(o);
        });
      }
      for (const order of openOrders) {
        if (!order.ticker) continue;
        if (positionTickers.has(order.ticker)) continue;
        // Skip only if DB already has a non-zero cost entry for this ticker
        // (if DB cost is 0, let live Kalshi data override it)
        const existingEntry = pendingMap.get(order.ticker);
        if (existingEntry && (existingEntry.cost_usd || 0) > 0) continue;
        // New order not in DB — derive values from Kalshi order fields
        const yesPriceCents    = order.yes_price ?? 0;
        const side             = order.side === "no" ? "no" : "yes";
        const actualPriceCents = side === "no" ? (100 - yesPriceCents) : yesPriceCents;
        const contracts        = order.remaining_count || order.count || 0;
        const costUSD          = (contracts * actualPriceCents) / 100;
        const maxPayoutUSD     = contracts * 1.0;
        let title = order.ticker;
        try {
          const mkt = (await kalshiPublicReq(`/markets/${order.ticker}`))?.market;
          if (mkt?.title) title = mkt.title;
        } catch {}
        pendingMap.set(order.ticker, {
          ticker: order.ticker, title, side, contracts,
          price:                actualPriceCents / 100,
          cost_usd:             costUSD,
          max_payout_usd:       maxPayoutUSD,
          potential_profit_usd: maxPayoutUSD - costUSD,
          status:               order.status || "resting",
          order_id:             order.order_id,
          is_pending:           true,
        });
      }
    } catch {}

    const pendingOrders = Array.from(pendingMap.values());

    // Include pending orders in aggregate totals (real money at stake)
    const pendingAtStake   = pendingOrders.reduce((s: number, o: any) => s + (o.cost_usd || 0), 0);
    const pendingMaxPayout = pendingOrders.reduce((s: number, o: any) => s + (o.max_payout_usd || 0), 0);
    const pendingProfit    = pendingOrders.reduce((s: number, o: any) => s + (o.potential_profit_usd || 0), 0);

    res.json({
      available_usd:              availableUSD,
      total_deposited_usd:        totalDepositedUSD,
      total_at_stake_usd:         totalAtStakeUSD + pendingAtStake,
      total_max_payout_usd:       totalMaxPayoutUSD + pendingMaxPayout,
      total_potential_profit_usd: totalPotentialProfitUSD + pendingProfit,
      positions,
      pending_orders:             pendingOrders,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Resolution checker — marks won/lost bets from settled Kalshi markets
predictorRouter.post("/check-resolutions", async (_req, res) => {
  try {
    const result = await checkResolutions();
    res.json({ ...result, message: `Checked ${result.checked} bets — ${result.resolved} resolved` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Run history — full list of past pipeline runs
predictorRouter.get("/runs", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, markets_scanned, candidates_found, bets_placed,
              analyzed_tickers, rounds, result_summary, scan_json, logged_at
       FROM predictor_scans
       ORDER BY logged_at DESC
       LIMIT 100`
    );
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Manual backfill endpoint — fills missing market_title for up to N bets.
// Useful when the routine placed bets via a path that didn't capture titles.
predictorRouter.post("/backfill-titles", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.body?.limit) || 200, 500);
    const out = await backfillKalshiTitles(limit);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Sync order statuses from Kalshi — reconciles DB with live Kalshi state
predictorRouter.post("/sync-orders", async (_req, res) => {
  try {
    const summary: any = { updated: 0, imported: 0, filled: 0, errors: [] };

    // 1. Fetch ALL resting orders from Kalshi
    const restingData = await kalshiReq("/portfolio/orders?status=resting", "GET");
    const restingOrders: any[] = restingData?.orders || [];

    // 2. Fetch recent fills to catch filled/settled orders
    const fillsData = await kalshiReq("/portfolio/fills?limit=50", "GET");
    const fills: any[] = fillsData?.fills || [];

    // 3. Get all orders from Kalshi (resting + recently cancelled/filled via order status)
    const allDbBets = await pool.query(
      "SELECT id, order_id, market_ticker, status, contracts, price, cost FROM predictor_bets WHERE order_id IS NOT NULL"
    );

    // 4. Update statuses (and fix zero contracts/cost/price) by checking live Kalshi order status
    for (const bet of allDbBets.rows) {
      if (!bet.order_id) continue;
      try {
        const orderData = await kalshiReq(`/portfolio/orders/${bet.order_id}`, "GET");
        const order = orderData?.order;
        if (!order) continue;

        const liveStatus = order.status; // resting, cancelled, filled, etc.
        const statusChanged = liveStatus && liveStatus !== bet.status;

        // Recalculate contracts/price/cost from live order if DB has zero values
        const dbContracts = parseFloat(bet.contracts) || 0;
        const dbCost      = parseFloat(bet.cost)      || 0;
        const yesPriceCents    = order.yes_price ?? 0;
        const side             = order.side === "no" ? "no" : "yes";
        const actualPriceCents = side === "no" ? (100 - yesPriceCents) : yesPriceCents;
        // For "executed" (in-book) orders, remaining_count may be 0 — fall back to count
        const liveContracts    = (order.remaining_count != null && order.remaining_count > 0)
          ? order.remaining_count : (order.count ?? 0);
        const livePrice        = actualPriceCents / 100;
        const liveCost         = (liveContracts * actualPriceCents) / 100;
        const needsAmountFix   = (dbContracts === 0 || dbCost === 0) && liveContracts > 0;

        if (statusChanged && needsAmountFix) {
          await pool.query(
            "UPDATE predictor_bets SET status=$1, contracts=$2, price=$3, cost=$4 WHERE order_id=$5",
            [liveStatus, liveContracts, livePrice, liveCost, bet.order_id]
          );
          summary.updated++;
          if (liveStatus === "filled") summary.filled++;
        } else if (needsAmountFix) {
          await pool.query(
            "UPDATE predictor_bets SET contracts=$1, price=$2, cost=$3 WHERE order_id=$4",
            [liveContracts, livePrice, liveCost, bet.order_id]
          );
          summary.updated++;
        } else if (statusChanged) {
          await pool.query(
            "UPDATE predictor_bets SET status=$1 WHERE order_id=$2",
            [liveStatus, bet.order_id]
          );
          summary.updated++;
          if (liveStatus === "filled") summary.filled++;
        }
      } catch (e: any) {
        summary.errors.push(`${bet.order_id}: ${e.message}`);
      }
    }

    // 5. Import any Kalshi orders NOT in our DB (resting + executed/in-book)
    const dbOrderIds = new Set(allDbBets.rows.map((r: any) => r.order_id).filter(Boolean));

    // Also fetch executed (in-book) orders so we catch limit orders in both states
    let allKalshiOrders: any[] = [...restingOrders];
    try {
      const execData  = await kalshiReq("/portfolio/orders?status=executed&limit=100", "GET");
      const execOrders: any[] = execData?.orders || [];
      for (const o of execOrders) {
        if (!allKalshiOrders.find((r: any) => r.order_id === o.order_id)) {
          allKalshiOrders.push(o);
        }
      }
    } catch {}

    for (const order of allKalshiOrders) {
      const oid = order.order_id;
      if (!oid || dbOrderIds.has(oid)) continue;

      // This order is on Kalshi but not in our DB — import it
      const betId     = `${order.ticker}-imported-${Date.now()}`;
      const side      = order.side === "no" ? "no" : "yes";
      // Price calculation: for NO bets, cost per contract = 1 - yes_price
      const yesPriceCents    = order.yes_price ?? 0;
      const actualPriceCents = side === "no" ? (100 - yesPriceCents) : yesPriceCents;
      const priceDecimal     = actualPriceCents / 100;
      const contracts        = (order.remaining_count != null && order.remaining_count > 0)
        ? order.remaining_count : (order.count ?? 0);
      const costUSD          = (contracts * actualPriceCents) / 100;

      // Fetch market title and close_time for a readable label
      let marketTitle = order.ticker;
      let closeTime: string | null = null;
      try {
        const mkt = (await kalshiPublicReq(`/markets/${order.ticker}`))?.market;
        if (mkt?.title) marketTitle = mkt.title;
        if (mkt?.close_time || mkt?.expiration_time) closeTime = mkt.close_time || mkt.expiration_time;
      } catch {}

      await pool.query(
        `INSERT INTO predictor_bets (id, market_ticker, market_title, side, contracts, price, cost, status, order_id, close_time, logged_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [betId, order.ticker, marketTitle, side, contracts, priceDecimal, costUSD, order.status || "resting", oid, closeTime]
      );
      summary.imported++;
      dbOrderIds.add(oid);
    }

    // 6. Backfill close_time for active bets that are missing it
    // Backfill close_time AND market_title for bets where either is missing
    // or where market_title equals the ticker (lookup previously failed).
    try {
      const needsFill = await pool.query(
        `SELECT id, market_ticker, market_title, close_time FROM predictor_bets
         WHERE platform = 'kalshi'
           AND status NOT IN ('cancelled','canceled','failed','settled')
           AND (close_time IS NULL OR market_title IS NULL OR market_title = market_ticker OR market_title = '')`
      );
      for (const bet of needsFill.rows) {
        try {
          const mkt = (await kalshiPublicReq(`/markets/${bet.market_ticker}`))?.market;
          const ct = mkt?.close_time || mkt?.expiration_time || null;
          const title = (mkt?.title || mkt?.subtitle || mkt?.yes_sub_title || "").toString().trim();
          const updates: string[] = [];
          const params: any[] = [];
          if (ct && !bet.close_time) {
            params.push(ct);
            updates.push(`close_time = $${params.length}`);
          }
          if (title && (!bet.market_title || bet.market_title === bet.market_ticker)) {
            params.push(title.slice(0, 500));
            updates.push(`market_title = $${params.length}`);
          }
          if (updates.length > 0) {
            params.push(bet.id);
            await pool.query(
              `UPDATE predictor_bets SET ${updates.join(', ')} WHERE id = $${params.length}`,
              params
            );
          }
        } catch {}
      }
    } catch {}

    res.json({ ...summary, message: `Sync complete — ${summary.updated} updated, ${summary.imported} imported, ${summary.filled} filled` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel ALL open Kalshi orders (bulk cancel)
predictorRouter.delete("/bets", async (_req, res) => {
  try {
    // Fetch all resting/pending orders from Kalshi
    const ordersResult = await kalshiReq("/portfolio/orders?status=resting", "GET");
    const orders: any[] = ordersResult?.orders || [];

    if (!orders.length) {
      return res.json({ cancelled: 0, message: "No open Kalshi orders found" });
    }

    let cancelled = 0;
    const errors: string[] = [];

    for (const order of orders) {
      const orderId = order.order_id;
      if (!orderId) continue;
      try {
        const result = await kalshiReq(`/portfolio/orders/${orderId}`, "DELETE");
        const errMsg = result?.error?.message;
        if (errMsg) {
          errors.push(`${orderId}: ${errMsg}`);
        } else {
          cancelled++;
          // Mark any matching DB bets as cancelled
          await pool.query(
            "UPDATE predictor_bets SET status='cancelled' WHERE order_id=$1",
            [orderId]
          );
        }
      } catch (e: any) {
        errors.push(`${orderId}: ${e.message}`);
      }
    }

    await insertLog("info", `[cancel-all] Cancelled ${cancelled}/${orders.length} Kalshi orders`);
    res.json({ cancelled, total: orders.length, errors });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.delete("/bets/:betId", async (req, res) => {
  const { betId } = req.params;
  try {
    const row = await pool.query(
      "SELECT order_id, status FROM predictor_bets WHERE id=$1",
      [betId]
    );
    if (!row.rows.length) return res.status(404).json({ error: "Bet not found" });

    const bet = row.rows[0];
    if (!bet.order_id) {
      return res.status(400).json({ error: "No Kalshi order ID stored for this bet — cannot cancel" });
    }
    if (["cancelled", "failed", "filled"].includes(bet.status)) {
      return res.status(400).json({ error: `Bet is already ${bet.status}` });
    }

    // Ask Kalshi to cancel the order
    const result = await kalshiReq(`/portfolio/orders/${bet.order_id}`, "DELETE");

    // Kalshi returns {} or { order: { status: "cancelled" } } on success
    // and { error: {...} } on failure
    const errMsg = result?.error?.message || (result?.error === true ? result?.message : null);
    if (errMsg) {
      return res.status(400).json({ error: `Kalshi rejected cancellation: ${errMsg}` });
    }

    await pool.query(
      "UPDATE predictor_bets SET status='cancelled' WHERE id=$1",
      [betId]
    );
    await insertLog("info", `[cancel] Cancelled bet ${betId} (order ${bet.order_id})`);
    res.json({ success: true, betId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// History endpoints
predictorRouter.get("/history", async (req, res) => {
  try {
    const type = (req.query.type as string) || "bets";
    switch (type) {
      case "bets": {
        const r = await pool.query(
          "SELECT * FROM predictor_bets ORDER BY logged_at DESC LIMIT 200"
        );
        return res.json(r.rows);
      }
      case "scans": {
        const r = await pool.query(
          "SELECT * FROM predictor_scans ORDER BY logged_at DESC LIMIT 50"
        );
        return res.json(r.rows);
      }
      case "councils": {
        const r = await pool.query(
          "SELECT * FROM predictor_councils ORDER BY logged_at DESC LIMIT 50"
        );
        return res.json(r.rows);
      }
      case "logs": {
        const r = await pool.query(
          "SELECT * FROM predictor_logs ORDER BY logged_at DESC LIMIT 200"
        );
        return res.json(r.rows);
      }
      default:
        return res.status(400).json({ error: "unknown type" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Settings
predictorRouter.get("/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM predictor_settings");
    const settings: any = {};
    r.rows.forEach((row) => (settings[row.key] = row.value));
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.post("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    await setSetting(key, String(value));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stats for dashboard
predictorRouter.get("/stats", async (_req, res) => {
  try {
    const [bets, councils, scans] = await Promise.all([
      pool.query("SELECT * FROM predictor_bets ORDER BY logged_at DESC LIMIT 100"),
      pool.query("SELECT * FROM predictor_councils ORDER BY logged_at DESC LIMIT 20"),
      pool.query("SELECT * FROM predictor_scans ORDER BY logged_at DESC LIMIT 10"),
    ]);

    const allBets = bets.rows;
    const settled = allBets.filter((b: any) => b.pnl != null);
    const wins = settled.filter((b: any) => parseFloat(b.pnl) > 0);
    const totalPnl = settled.reduce((s: number, b: any) => s + (parseFloat(b.pnl) || 0), 0);
    const totalRisked = allBets.reduce((s: number, b: any) => s + (parseFloat(b.cost) || 0), 0);
    const avgEdge = allBets.length
      ? allBets.reduce((s: number, b: any) => s + (parseFloat(b.edge) || 0), 0) / allBets.length
      : 0;

    res.json({
      total_bets: allBets.length,
      settled: settled.length,
      wins: wins.length,
      win_rate: settled.length ? (wins.length / settled.length) * 100 : 0,
      total_pnl: totalPnl,
      total_risked: totalRisked,
      roi: totalRisked ? (totalPnl / totalRisked) * 100 : 0,
      avg_edge: avgEdge,
      active_positions: allBets.filter((b: any) => b.status === "filled" && b.pnl == null).length,
      recent_councils: councils.rows.slice(0, 5),
      recent_scans: scans.rows.slice(0, 3),
      recent_bets: allBets.slice(0, 10),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Predictor Chat ────────────────────────────────────────────────────────────

predictorRouter.get("/chat", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM predictor_chat ORDER BY created_at ASC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.delete("/chat", async (_req, res) => {
  try {
    await pool.query("DELETE FROM predictor_chat");
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    // Save user message
    await pool.query("INSERT INTO predictor_chat (role, content) VALUES ('user', $1)", [message]);

    // Gather context
    const [betsR, councilsR, settingsR, histR] = await Promise.all([
      pool.query("SELECT * FROM predictor_bets ORDER BY logged_at DESC LIMIT 30"),
      pool.query("SELECT market_title, our_probability, market_probability, edge, verdict, logged_at FROM predictor_councils ORDER BY logged_at DESC LIMIT 10"),
      pool.query("SELECT key, value FROM predictor_settings"),
      pool.query("SELECT role, content FROM predictor_chat ORDER BY created_at DESC LIMIT 20"),
    ]);

    const settings: any = {};
    settingsR.rows.forEach((r: any) => (settings[r.key] = r.value));
    const history = histR.rows.reverse();

    const allBets = betsR.rows;
    const settled = allBets.filter((b: any) => b.pnl != null);
    const wins    = settled.filter((b: any) => parseFloat(b.pnl) > 0).length;
    const totalPnl = settled.reduce((s: number, b: any) => s + (parseFloat(b.pnl) || 0), 0);
    const avgEdge  = allBets.length ? allBets.reduce((s: number, b: any) => s + (parseFloat(b.edge) || 0), 0) / allBets.length : 0;

    const betsContext = allBets.slice(0, 15).map((b: any) =>
      `[${new Date(b.logged_at).toLocaleDateString()}] ${b.side?.toUpperCase()} ${b.market_ticker} — ${b.market_title} | confidence:${(b.confidence*100).toFixed(0)}% edge:${(parseFloat(b.edge)*100).toFixed(1)}pp ${b.pnl != null ? `P&L:$${parseFloat(b.pnl).toFixed(2)}` : "pending"}`
    ).join("\n");

    const councilContext = councilsR.rows.map((c: any) =>
      `[${new Date(c.logged_at).toLocaleDateString()}] ${c.market_title}: market=${(c.market_probability*100).toFixed(0)}% ours=${(c.our_probability*100).toFixed(0)}% edge=${(c.edge*100).toFixed(1)}pp verdict=${c.verdict}`
    ).join("\n");

    const systemPrompt = `You are Claude Predictor, an AI advisor for a Kalshi prediction market betting system at JD CoreDev.

CURRENT SETTINGS:
- Mode: ${settings.mode || "demo"}
- Min edge threshold: ${((parseFloat(settings.min_edge||"0.15"))*100).toFixed(0)}pp
- Max bet size: $${settings.max_bet_usd || "25"}
- Max open positions: ${settings.max_positions || "10"}
- Kelly fraction: ${settings.kelly_fraction || "0.25"}
- Auto-scan: ${settings.cron_enabled === "true" ? "ON (every 2h)" : "OFF"}

PERFORMANCE SUMMARY:
- Total bets: ${allBets.length} (${settled.length} settled, ${allBets.length - settled.length} pending)
- Win rate: ${settled.length ? ((wins/settled.length)*100).toFixed(0) : "—"}% (${wins}W / ${settled.length - wins}L)
- Total P&L: $${totalPnl.toFixed(2)}
- Avg edge taken: ${(avgEdge*100).toFixed(1)}pp

RECENT BETS:
${betsContext || "No bets yet"}

RECENT COUNCIL DEBATES:
${councilContext || "No councils yet"}

INSTRUCTIONS:
- Answer questions about bet decisions, council debates, edge reasoning, and strategy
- Discuss which market categories are performing well/poorly
- Help the user optimise settings (min edge, bet sizing, Kelly fraction)
- Explain why the council agents reached specific verdicts
- Be direct and data-driven. Keep responses concise.
- Do NOT suggest executing live trades — this system is for prediction markets, not equities.`;

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-16).map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
    ];

    const openaiRes = await fetch(`${process.env.AI_INTEGRATIONS_OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AI_INTEGRATIONS_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: openaiMessages, max_tokens: 800, temperature: 0.7 }),
    });

    if (!openaiRes.ok) throw new Error(`OpenAI error: ${await openaiRes.text()}`);
    const openaiData = await openaiRes.json();
    const content: string = openaiData.choices?.[0]?.message?.content || "No response";

    await pool.query("INSERT INTO predictor_chat (role, content) VALUES ('assistant', $1)", [content]);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

export async function initPredictor() {
  await initPredictorTables();
  console.log("[predictor] tables ready");

  // ── Startup credential guards ────────────────────────────────────────────
  const _pk = process.env.POLY_PRIVATE_KEY || "";
  if (_pk && !/^0x[a-fA-F0-9]{64}$/.test(_pk)) {
    throw new Error(
      "[predictor] FATAL: POLY_PRIVATE_KEY is not a valid EOA private key " +
      "(must be 0x-prefixed 64 hex chars, e.g. from MetaMask export). " +
      "Current value looks like a UUID or bare hex — update the secret before live trading."
    );
  }
  const _funder = process.env.POLY_FUNDER || "";
  if (_funder && !/^0x[a-fA-F0-9]{40}$/.test(_funder)) {
    throw new Error(
      "[predictor] FATAL: POLY_FUNDER is not a valid EOA address " +
      "(must be 0x-prefixed 40 hex chars matching your MetaMask wallet). " +
      "Update the secret before live trading."
    );
  }
  if (_pk) console.log("[predictor] POLY_PRIVATE_KEY format: OK (EOA)");
  if (_funder) console.log("[predictor] POLY_FUNDER format: OK (EOA address)");

  console.log("[predictor] manual-fire mode — cron removed; routine drives pipeline runs");
}
