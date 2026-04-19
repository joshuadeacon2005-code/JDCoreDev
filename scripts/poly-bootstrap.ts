/**
 * One-time Polymarket credential bootstrap.
 *
 * Usage (after updating POLY_PRIVATE_KEY and POLY_FUNDER in Replit secrets):
 *   npm run poly:bootstrap
 *
 * What it does:
 *   1. Reads POLY_PRIVATE_KEY from env.
 *   2. Instantiates a ClobClient (no API creds yet — signer only).
 *   3. Calls createOrDeriveApiKey() to obtain fresh API credentials.
 *   4. Writes apiKey, secret, and passphrase to Replit secrets via the CLI.
 *      Values are NEVER printed to stdout or written to disk.
 *
 * IMPORTANT: Do NOT run this until you have updated POLY_PRIVATE_KEY and
 * POLY_FUNDER in Replit secrets with your real MetaMask EOA values.
 */

import { ethers } from "ethers";
import { ClobClient } from "@polymarket/clob-client";
import { execSync } from "child_process";

const POLY_HOST  = "https://clob.polymarket.com";
const POLY_CHAIN = 137;

async function main() {
  const privateKey = process.env.POLY_PRIVATE_KEY || "";
  const funder     = process.env.POLY_FUNDER      || "";

  if (!privateKey) {
    throw new Error("POLY_PRIVATE_KEY is not set. Update the Replit secret first.");
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error(
      "POLY_PRIVATE_KEY is not a valid EOA private key. " +
      "It must be 0x-prefixed followed by exactly 64 hex characters (from MetaMask export)."
    );
  }
  if (!funder) {
    throw new Error("POLY_FUNDER is not set. Update the Replit secret first.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(funder)) {
    throw new Error(
      "POLY_FUNDER is not a valid EOA address. " +
      "It must be 0x-prefixed followed by exactly 40 hex characters (your MetaMask wallet address)."
    );
  }

  console.log("Connecting to Polymarket CLOB with EOA signer…");

  const wallet = new ethers.Wallet(privateKey);

  // Instantiate without API creds — we are about to derive them
  const client = new ClobClient(
    POLY_HOST,
    POLY_CHAIN,
    wallet as any,
    undefined,
    0,           // signatureType 0 = EOA
    funder,
  );

  console.log("Deriving API credentials from on-chain signature…");
  const derived = await client.createOrDeriveApiKey(0);

  if (!derived || !derived.key || !derived.secret || !derived.passphrase) {
    throw new Error("createOrDeriveApiKey returned incomplete credentials.");
  }

  // Write directly to Replit secrets — never print the values
  function setSecret(name: string, value: string) {
    execSync(`replit secrets set ${name} '${value}'`, { stdio: "pipe" });
  }

  setSecret("POLY_API_KEY",        derived.key);
  setSecret("POLY_API_SECRET",     derived.secret);
  setSecret("POLY_API_PASSPHRASE", derived.passphrase);

  console.log(
    "Bootstrap complete. POLY_API_KEY / POLY_API_SECRET / POLY_API_PASSPHRASE written to secrets."
  );
}

main().catch((err) => {
  console.error("Bootstrap FAILED:", err.message);
  process.exit(1);
});
