import crypto from "node:crypto";
import { config } from "./config";
import { logger } from "./logger";

/**
 * Verifica server-side degli acquisti store-native (Google Play / Apple).
 *
 * Il verifier è INIETTABILE (__setIapVerifierForTest) così i test non toccano la
 * rete. L'implementazione reale parte solo se le credenziali sono configurate
 * (config.isIapVerificationConfigured); altrimenti lancia
 * PURCHASE_VERIFICATION_UNAVAILABLE (503).
 */

export type VerifyPlatform = "google" | "apple";

export interface VerifyPurchaseInput {
  platform: VerifyPlatform;
  productId: string;
  /** Google Play: token di acquisto. */
  purchaseToken?: string;
  /** Apple: ricevuta base64 (receipt-data). */
  receiptData?: string;
  /** Apple: id transazione (opzionale, informativo). */
  transactionId?: string;
}

export interface VerifyOutcome {
  valid: boolean;
  productId: string;
  expiresAt: Date | null;
  canceled: boolean;
  originalTransactionId: string | null;
  transactionId: string | null;
  /** Ricevuta/token grezzi normalizzati, per ri-verifica e ripristino. */
  rawReceipt: string | null;
  reason?: string;
}

export interface IapVerifier {
  verify(input: VerifyPurchaseInput): Promise<VerifyOutcome>;
}

export type PurchaseErrorCode =
  | "PURCHASE_VERIFICATION_UNAVAILABLE"
  | "PURCHASE_INVALID"
  | "PURCHASE_VERIFICATION_FAILED";

const PURCHASE_HTTP: Record<PurchaseErrorCode, number> = {
  PURCHASE_VERIFICATION_UNAVAILABLE: 503,
  PURCHASE_INVALID: 400,
  PURCHASE_VERIFICATION_FAILED: 502,
};

const PURCHASE_MESSAGES: Record<PurchaseErrorCode, string> = {
  PURCHASE_VERIFICATION_UNAVAILABLE:
    "La verifica degli acquisti non è al momento disponibile. Riprova più tardi.",
  PURCHASE_INVALID: "L'acquisto non risulta valido. Controlla e riprova.",
  PURCHASE_VERIFICATION_FAILED:
    "Non è stato possibile verificare l'acquisto. Riprova tra poco.",
};

export class PurchaseVerificationError extends Error {
  code: PurchaseErrorCode;
  httpStatus: number;
  userMessage: string;
  constructor(code: PurchaseErrorCode, internalMessage?: string) {
    super(internalMessage || code);
    this.name = "PurchaseVerificationError";
    this.code = code;
    this.httpStatus = PURCHASE_HTTP[code];
    this.userMessage = PURCHASE_MESSAGES[code];
  }
}

export function isPurchaseVerificationError(e: unknown): e is PurchaseVerificationError {
  return e instanceof PurchaseVerificationError;
}

// ---------------------------------------------------------------------------
// Apple — verifyReceipt (abbonamenti). Produzione con fallback sandbox (21007).
// ---------------------------------------------------------------------------
const APPLE_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

async function appleVerifyReceipt(receiptData: string): Promise<any> {
  const body = JSON.stringify({
    "receipt-data": receiptData,
    password: config.iap.appleSharedSecret,
    "exclude-old-transactions": true,
  });

  const post = async (url: string) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) throw new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED", `Apple HTTP ${res.status}`);
    return res.json() as Promise<any>;
  };

  let json = await post(APPLE_PROD);
  // 21007: ricevuta di sandbox inviata in produzione -> ritenta su sandbox.
  if (json?.status === 21007) json = await post(APPLE_SANDBOX);
  return json;
}

async function verifyApple(input: VerifyPurchaseInput): Promise<VerifyOutcome> {
  if (!input.receiptData) {
    throw new PurchaseVerificationError("PURCHASE_INVALID", "receiptData mancante (Apple)");
  }
  let json: any;
  try {
    json = await appleVerifyReceipt(input.receiptData);
  } catch (e) {
    if (isPurchaseVerificationError(e)) throw e;
    logger.error("Apple verifyReceipt error", { error: String(e) });
    throw new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED", "Apple verifyReceipt fallita");
  }

  if (json?.status !== 0) {
    return {
      valid: false, productId: input.productId, expiresAt: null, canceled: false,
      originalTransactionId: null, transactionId: null, rawReceipt: input.receiptData,
      reason: `apple_status_${json?.status}`,
    };
  }

  const infos: any[] = Array.isArray(json.latest_receipt_info) ? json.latest_receipt_info : [];
  const matching = infos.filter((i) => !input.productId || i.product_id === input.productId);
  const pool = matching.length > 0 ? matching : infos;
  if (pool.length === 0) {
    return {
      valid: false, productId: input.productId, expiresAt: null, canceled: false,
      originalTransactionId: null, transactionId: null, rawReceipt: json.latest_receipt || input.receiptData,
      reason: "apple_no_transactions",
    };
  }

  let latest = pool[0];
  let expiresMs = 0;
  for (const i of pool) {
    const ms = Number(i.expires_date_ms || 0);
    if (ms >= expiresMs) { expiresMs = ms; latest = i; }
  }
  const now = Date.now();
  const canceled = pool.some((i) => !!i.cancellation_date_ms);
  const valid = expiresMs > now && !canceled;

  return {
    valid,
    productId: latest.product_id || input.productId,
    expiresAt: expiresMs > 0 ? new Date(expiresMs) : null,
    canceled,
    originalTransactionId: latest.original_transaction_id || null,
    transactionId: latest.transaction_id || input.transactionId || null,
    rawReceipt: json.latest_receipt || input.receiptData,
    reason: valid ? undefined : "apple_expired_or_canceled",
  };
}

// ---------------------------------------------------------------------------
// Google Play — Android Publisher API (subscriptions). Access token via JWT
// (service account, RS256) -> GET .../purchases/subscriptions/.../tokens/...
// ---------------------------------------------------------------------------
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleAccessToken(): Promise<string> {
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try {
    sa = JSON.parse(config.iap.googleServiceAccountJson);
  } catch {
    throw new PurchaseVerificationError("PURCHASE_VERIFICATION_UNAVAILABLE", "Service account Google non valido");
  }
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: tokenUri,
    iat,
    exp: iat + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = base64url(crypto.createSign("RSA-SHA256").update(signingInput).sign(sa.private_key));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED", `Google token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED", "Google access_token assente");
  return json.access_token;
}

async function verifyGoogle(input: VerifyPurchaseInput): Promise<VerifyOutcome> {
  if (!input.purchaseToken) {
    throw new PurchaseVerificationError("PURCHASE_INVALID", "purchaseToken mancante (Google)");
  }
  let json: any;
  try {
    const token = await googleAccessToken();
    const pkg = encodeURIComponent(config.iap.androidPackageName);
    const product = encodeURIComponent(input.productId);
    const purchase = encodeURIComponent(input.purchaseToken);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptions/${product}/tokens/${purchase}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 400 || res.status === 404 || res.status === 410) {
      return {
        valid: false, productId: input.productId, expiresAt: null, canceled: false,
        originalTransactionId: null, transactionId: null, rawReceipt: input.purchaseToken,
        reason: `google_status_${res.status}`,
      };
    }
    if (!res.ok) throw new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED", `Google API HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    if (isPurchaseVerificationError(e)) throw e;
    logger.error("Google purchase verify error", { error: String(e) });
    throw new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED", "Google verify fallita");
  }

  const expiryMs = Number(json.expiryTimeMillis || 0);
  const now = Date.now();
  const canceled = json.cancelReason !== undefined && json.cancelReason !== null;
  // paymentState: 0=pending, 1=received, 2=free trial, 3=deferred. Valido se pagato/trial.
  const paid = json.paymentState === 1 || json.paymentState === 2;
  const valid = expiryMs > now && paid && !canceled;

  return {
    valid,
    productId: input.productId,
    expiresAt: expiryMs > 0 ? new Date(expiryMs) : null,
    canceled,
    originalTransactionId: json.orderId || null,
    transactionId: json.orderId || input.transactionId || null,
    rawReceipt: input.purchaseToken,
    reason: valid ? undefined : "google_expired_or_unpaid",
  };
}

// ---------------------------------------------------------------------------
// Verifier reale: instrada per piattaforma, gate su credenziali configurate.
// ---------------------------------------------------------------------------
const realVerifier: IapVerifier = {
  async verify(input) {
    if (!config.isIapVerificationConfigured(input.platform)) {
      throw new PurchaseVerificationError(
        "PURCHASE_VERIFICATION_UNAVAILABLE",
        `Credenziali ${input.platform} non configurate`,
      );
    }
    return input.platform === "apple" ? verifyApple(input) : verifyGoogle(input);
  },
};

let verifier: IapVerifier = realVerifier;

export function __setIapVerifierForTest(v: IapVerifier): void {
  verifier = v;
}
export function __resetIapVerifierForTest(): void {
  verifier = realVerifier;
}

export async function verifyPurchase(input: VerifyPurchaseInput): Promise<VerifyOutcome> {
  return verifier.verify(input);
}
