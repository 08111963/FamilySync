import { Platform } from "react-native";

/**
 * Servizio acquisti in-app store-native (Premium).
 *
 * IMPORTANTE: gli acquisti reali (Google Play Billing / Apple StoreKit)
 * richiedono una build NATIVA di produzione con il modulo store integrato.
 * In Expo Go e sul web il modulo nativo non è disponibile: isIapAvailable()
 * ritorna false e le funzioni di acquisto lanciano IapError("IAP_NOT_AVAILABLE").
 *
 * Il flusso è già cablato verso il backend: una volta integrato il modulo
 * nativo nella build di produzione, qui si ottiene il token/ricevuta e lo si
 * invia a POST /api/purchases/verify (e /restore per il ripristino).
 */

export type StorePlatform = "google" | "apple";

export type PurchaseResult = {
  platform: StorePlatform;
  productId: string;
  /** Google Play: token di acquisto. */
  purchaseToken?: string;
  /** Apple: ricevuta base64. */
  receiptData?: string;
  /** Apple: id transazione. */
  transactionId?: string;
};

export type IapErrorCode = "IAP_NOT_AVAILABLE" | "IAP_CANCELLED" | "IAP_FAILED";

export class IapError extends Error {
  code: IapErrorCode;
  constructor(code: IapErrorCode, message?: string) {
    super(message || code);
    this.name = "IapError";
    this.code = code;
  }
}

/** Piattaforma store del dispositivo corrente, o null sul web. */
export function getStorePlatform(): StorePlatform | null {
  if (Platform.OS === "android") return "google";
  if (Platform.OS === "ios") return "apple";
  return null;
}

/**
 * Gli acquisti in-app reali sono disponibili solo in una build nativa di
 * produzione con il modulo store. In Expo Go / web non lo sono.
 */
export function isIapAvailable(): boolean {
  return false;
}

const NOT_AVAILABLE_MSG =
  "Gli acquisti in-app sono disponibili solo nell'app pubblicata su App Store / Google Play.";

export async function purchasePremium(_productId: string): Promise<PurchaseResult> {
  throw new IapError("IAP_NOT_AVAILABLE", NOT_AVAILABLE_MSG);
}

export async function restorePurchases(): Promise<PurchaseResult[]> {
  throw new IapError("IAP_NOT_AVAILABLE", NOT_AVAILABLE_MSG);
}
