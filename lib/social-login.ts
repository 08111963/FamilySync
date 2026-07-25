import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";

import { getApiUrl } from "@/lib/query-client";

// Chiude il popup di autenticazione quando il browser torna sull'app (solo web).
WebBrowser.maybeCompleteAuthSession();

export interface SocialSession {
  user: { id: string; email: string; name: string; emailVerified: boolean };
  accessToken: string;
  refreshToken: string;
}

/** Nuovo utente social: la registrazione va completata (età, privacy, Termini). */
export interface SocialSignupPending {
  needsCompletion: true;
  signupToken: string;
  suggestedName: string | null;
}

export type SocialLoginResult = SocialSession | SocialSignupPending;

export function isSignupPending(r: SocialLoginResult): r is SocialSignupPending {
  return (r as SocialSignupPending).needsCompletion === true;
}

async function parseJsonOrThrow(res: Response, fallbackMsg: string): Promise<any> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    throw new Error(body?.error?.message || fallbackMsg);
  }
  return body;
}

// Il loginCode è monouso lato server: può arrivare sia dalla promise di
// loginWithGoogle sia dal deep link gestito da login.tsx. Chi lo "prenota"
// per primo lo scambia; l'altro percorso deve ignorarlo, altrimenti il
// secondo tentativo fallisce con "codice già usato".
const claimedLoginCodes = new Set<string>();

/** Prenota un loginCode: ritorna true solo al primo chiamante. */
export function claimLoginCode(code: string): boolean {
  if (claimedLoginCodes.has(code)) return false;
  claimedLoginCodes.add(code);
  return true;
}

/** Scambia il codice di login monouso con i token di sessione. */
export async function completeOauth(loginCode: string): Promise<SocialSession> {
  const url = new URL("/api/auth/oauth/complete", getApiUrl());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginCode }),
  });
  return parseJsonOrThrow(res, "Accesso non riuscito. Riprova.");
}

/**
 * Accesso con Google: apre il flusso OAuth gestito dal backend in una sessione
 * browser sicura; al ritorno l'URL contiene un codice di login monouso che
 * viene scambiato con i token di sessione.
 */
export async function loginWithGoogle(): Promise<SocialLoginResult | null> {
  // In Expo Go tramite tunnel HTTPS (ngrok) il deep link di ritorno deve usare
  // lo schema sicuro exps://, altrimenti Expo Go non riesce a ricaricare il
  // progetto ("Something went wrong") quando il browser rimanda all'app.
  let returnUrl = Linking.createURL("login");
  if (returnUrl.startsWith("exp://") && returnUrl.includes("ngrok")) {
    returnUrl = returnUrl.replace(/^exp:\/\//, "exps://");
  }
  const startUrl = new URL("/api/auth/google/start", getApiUrl());
  startUrl.searchParams.set("returnUrl", returnUrl);

  // Su Android (specialmente in Expo Go) openAuthSessionAsync a volte ritorna
  // "dismiss" anche quando il redirect è avvenuto: ascoltiamo anche l'evento
  // di deep link come rete di sicurezza per catturare comunque l'URL di ritorno.
  let deepLinkUrl: string | null = null;
  const subscription = Linking.addEventListener("url", ({ url }) => {
    if (url && (url.includes("loginCode=") || url.includes("signupToken="))) {
      deepLinkUrl = url;
    }
  });

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    // showInRecents (Android): mantiene viva la finestra di accesso quando
    // l'utente cambia app per confermare la verifica di sicurezza sul telefono.
    result = await WebBrowser.openAuthSessionAsync(startUrl.toString(), returnUrl, {
      showInRecents: true,
    });
    if (result.type !== "success" && !deepLinkUrl) {
      // Piccola attesa: l'evento di deep link può arrivare subito dopo
      // la chiusura della finestra del browser.
      await new Promise((r) => setTimeout(r, 700));
    }
  } finally {
    subscription.remove();
  }

  const finalUrl = result.type === "success" && result.url ? result.url : deepLinkUrl;
  if (!finalUrl) {
    // L'utente ha chiuso la finestra: nessun errore da mostrare.
    return null;
  }
  let loginCode: string | null = null;
  let signupToken: string | null = null;
  let suggestedName: string | null = null;
  try {
    const parsed = Linking.parse(finalUrl);
    loginCode = (parsed.queryParams?.loginCode as string) || null;
    signupToken = (parsed.queryParams?.signupToken as string) || null;
    suggestedName = (parsed.queryParams?.suggestedName as string) || null;
  } catch {}
  if (signupToken) {
    // Nuovo utente: nessun account ancora creato, serve il completamento.
    return { needsCompletion: true, signupToken, suggestedName };
  }
  if (!loginCode) {
    throw new Error("Accesso con Google non riuscito. Riprova.");
  }
  if (!claimLoginCode(loginCode)) {
    // Il deep link è già stato preso in carico dalla schermata di login:
    // non consumare di nuovo il codice, nessun errore da mostrare.
    return null;
  }
  return completeOauth(loginCode);
}

/** Completa la registrazione social con i consensi espressi dall'utente. */
export async function completeSocialSignup(data: {
  signupToken: string;
  name: string;
  ageBand: "under14" | "14_17" | "adult";
  acceptedTerms: true;
  aiConsent?: boolean;
}): Promise<SocialSession> {
  const url = new URL("/api/auth/social/complete", getApiUrl());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonOrThrow(res, "Registrazione non riuscita. Riprova.");
}

/** Il pulsante Apple va mostrato solo dove il login nativo è disponibile. */
export async function isAppleLoginAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Accesso con Apple (nativo iOS): ottiene l'identityToken e lo invia al
 * backend, che ne verifica la firma e autentica l'utente.
 */
export async function loginWithApple(): Promise<SocialLoginResult | null> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: any) {
    if (err?.code === "ERR_REQUEST_CANCELED") return null;
    throw new Error("Accesso con Apple non riuscito. Riprova.");
  }
  if (!credential.identityToken) {
    throw new Error("Accesso con Apple non riuscito. Riprova.");
  }
  // Apple fornisce il nome solo al primissimo accesso.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ");

  const url = new URL("/api/auth/apple", getApiUrl());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identityToken: credential.identityToken, fullName: fullName || undefined }),
  });
  return parseJsonOrThrow(res, "Accesso con Apple non riuscito. Riprova.");
}
