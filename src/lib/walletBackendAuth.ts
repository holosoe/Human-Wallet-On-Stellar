import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

/**
 * Server-only helper to build JWT Authorization header for wallet-backend.
 * Uses private Stellar secret seed from server-side environment variable.
 */
const BASE_URL = process.env.WALLET_BACKEND_URL;
const JWT_PRIVATE_KEY = process.env.WALLET_BACKEND_JWT_PRIVATE_KEY; // Server-side only!

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  // Node.js crypto only (server-side)
  const nodeCrypto = await import("crypto");
  const hash = nodeCrypto
    .createHash("sha256")
    .update(Buffer.from(input))
    .digest("hex");
  return hash;
}

/**
 * Build JWT Authorization header for wallet-backend API.
 * @param method HTTP method (e.g., "POST")
 * @param path API path (e.g., "/accounts/...")
 * @param bodyRaw Raw request body string
 * @returns JWT Authorization header string
 */
export async function buildAuthHeaderServer(
  method: string,
  path: string,
  bodyRaw: string,
): Promise<string> {
  if (!JWT_PRIVATE_KEY) {
    throw new Error("WALLET_BACKEND_JWT_PRIVATE_KEY is not set");
  }
  if (!BASE_URL) {
    throw new Error("WALLET_BACKEND_URL is not set");
  }
  const url = new URL(BASE_URL);
  // Prefer explicit AUD override, else use host (hostname:port)
  const aud = process.env.WALLET_BACKEND_AUD || url.host;
  const iat = Math.floor(Date.now() / 1000);
  // Backend enforces max 5s JWT lifetime
  const exp = iat + 5;
  const bodyHash = await sha256Hex(new TextEncoder().encode(bodyRaw || ""));
  const sub = Keypair.fromSecret(JWT_PRIVATE_KEY).publicKey();

  const header = { alg: "EdDSA", typ: "JWT" };
  const payload = {
    iat,
    exp,
    aud,
    sub,
    methodAndPath: `${method.toUpperCase()} ${path}`,
    bodyHash,
  };

  const encodedHeader = toBase64Url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const kp = Keypair.fromSecret(JWT_PRIVATE_KEY);
  const sig = kp.sign(Buffer.from(signingInput)); // raw 64-byte Ed25519
  const encodedSig = toBase64Url(Buffer.from(sig));
  return `Bearer ${signingInput}.${encodedSig}`;
}
