// Verifica che la Privacy Policy web e mobile provengano dalla stessa
// FONTE UNICA (shared/privacy-policy-content.ts) e che il contenuto
// includa le correzioni obbligatorie della v2.1.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_INTRO,
} from "../../shared/privacy-policy-content";
import { PRIVACY_POLICY_VERSION } from "../../shared/policy-version";

const root = resolve(__dirname, "..", "..");

test("la route web importa la fonte unica della policy", () => {
  const src = readFileSync(resolve(root, "server/routes/legal.ts"), "utf8");
  assert.match(src, /from ['"]\.\.\/\.\.\/shared\/privacy-policy-content['"]/);
  assert.match(src, /PRIVACY_POLICY_SECTIONS/);
});

test("la schermata mobile importa la fonte unica della policy", () => {
  const src = readFileSync(resolve(root, "app/legal/privacy.tsx"), "utf8");
  assert.match(src, /from ['"]@\/shared\/privacy-policy-content['"]/);
  assert.match(src, /PRIVACY_POLICY_SECTIONS/);
});

test("nessun testo legale duplicato hardcoded nella schermata mobile", () => {
  const src = readFileSync(resolve(root, "app/legal/privacy.tsx"), "utf8");
  assert.ok(!src.includes("facoltativa"), "la fascia di età non deve essere descritta come facoltativa");
  assert.ok(!src.includes("Titolare del Trattamento"), "i testi di sezione non devono essere duplicati nel file mobile");
});

test("la fonte unica contiene le correzioni obbligatorie v2.1", () => {
  const all = JSON.stringify(PRIVACY_POLICY_SECTIONS);
  assert.equal(PRIVACY_POLICY_SECTIONS.length, 23);
  assert.match(PRIVACY_POLICY_INTRO, new RegExp(PRIVACY_POLICY_VERSION.replace(".", "\\.")));
  assert.ok(all.includes("Fascia di età (obbligatoria)"), "età obbligatoria");
  assert.ok(all.includes("allergie e intolleranze"), "allergie descritte nella policy");
  assert.ok(all.includes("account idonei"), "AI disponibile senza toggle separato");
  assert.ok(!all.includes("consenso specifico e separato"), "nessun consenso allergie separato");
  assert.ok(all.includes("alias temporanei"), "alias membri per ottimizzazione faccende");
  assert.ok(all.includes("dati personali di utilizzo"), "analytics come dati personali");
  assert.ok(all.includes("massimo **30 giorni**"), "retention analytics 30 giorni");
  assert.ok(all.includes("articolo 28 GDPR"), "wording prudente fornitori");
  assert.ok(all.includes("contenuti già archiviati nella chat non vengono inviati automaticamente"), "chat non inviata automaticamente all'AI");
  assert.ok(!all.includes("12 mesi"), "nessuna promessa di retention log 12 mesi");
  assert.ok(!all.includes("OpenAI, L.L.C."), "nessuna denominazione contrattuale inventata");
  assert.ok(!all.includes("Data Privacy Framework"), "nessun meccanismo di trasferimento inventato");
  assert.ok(!all.includes("Clausole Contrattuali Standard"), "nessun meccanismo di trasferimento inventato");
});

test("la fonte unica contiene il paragrafo Google Calendar (verifica Google)", () => {
  const all = JSON.stringify(PRIVACY_POLICY_SECTIONS);
  const section = PRIVACY_POLICY_SECTIONS.find((s) =>
    s.title.includes("Google Calendar"),
  );
  assert.ok(section, "sezione dedicata Google Calendar presente");
  const text = JSON.stringify(section);
  assert.ok(text.includes("refresh token"), "menziona il refresh token");
  assert.ok(text.includes("in forma cifrata"), "token conservato cifrato");
  assert.ok(text.includes("Email dell'account Google"), "email account collegato");
  assert.ok(text.includes("scrive, aggiorna e cancella"), "uso scope calendar.events");
  assert.ok(text.includes("non legge e non modifica"), "nessuna lettura eventi altrui");
  assert.ok(text.includes("Limited Use"), "richiamo alla Google API Services User Data Policy");
  assert.ok(text.includes("myaccount.google.com/permissions"), "revoca lato Google");
  assert.ok(text.includes("art. 6.1.a"), "base giuridica consenso");
});
