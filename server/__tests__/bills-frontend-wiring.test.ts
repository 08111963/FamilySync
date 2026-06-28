import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Notifiche bollette montate GLOBALMENTE (non solo nella tab)", () => {
  test("_layout.tsx monta BillNotificationsSyncProvider", () => {
    const layout = read("app/_layout.tsx");
    assert.match(layout, /import\s*\{\s*BillNotificationsSyncProvider\s*\}/);
    assert.match(layout, /<BillNotificationsSyncProvider>/);
  });

  test("il provider globale chiama useBillLocalNotifications e carica le bollette", () => {
    const provider = read("context/BillNotificationsProvider.tsx");
    assert.match(provider, /useBillLocalNotifications\s*\(/);
    assert.match(provider, /useFamily\s*\(/);
    assert.match(provider, /\/api\/bills\//);
  });

  test("la tab Bollette NON chiama più direttamente useBillLocalNotifications", () => {
    const bills = read("app/(tabs)/bills.tsx");
    assert.doesNotMatch(bills, /useBillLocalNotifications\s*\(/);
    // ma legge lo stato del permesso dal provider globale
    assert.match(bills, /useBillNotificationsStatus\s*\(/);
  });
});

describe("Ripartizione personalizzata (frontend bill/[id].tsx)", () => {
  const src = read("app/bill/[id].tsx");

  test("invia type = 'custom' con splits personalizzati al backend", () => {
    assert.match(src, /type:\s*["'`]custom["'`]\s*,\s*splits/);
  });

  test("offre entrambe le modalità: equa e personalizzata", () => {
    assert.match(src, /type:\s*["'`]equal["'`]/);
    assert.match(src, /splitMode/);
    assert.match(src, /testID=["'`]split-mode-custom["'`]/);
    assert.match(src, /testID=["'`]split-mode-equal["'`]/);
  });

  test("mostra totale bolletta, totale quote e differenza residua", () => {
    assert.match(src, /Totale bolletta/);
    assert.match(src, /Totale quote inserite/);
    assert.match(src, /Differenza residua/);
    assert.match(src, /enteredTotal/);
    assert.match(src, /splitDifference/);
  });

  test("blocca il salvataggio se la somma non coincide (errore + disabled)", () => {
    assert.match(src, /customSplitValid/);
    assert.match(src, /disabled=\{!customSplitValid\}/);
    assert.match(src, /testID=["'`]split-error["'`]/);
    // tolleranza di 1 centesimo, stessa formula NON arrotondata del backend
    assert.match(src, /Math\.abs\(splitDifferenceRaw\)\s*<=\s*0\.01/);
  });

  test("validazione FE allineata al BE (nessun arrotondamento anticipato sul confronto)", () => {
    // il confronto usa la differenza grezza, non quella arrotondata per la visualizzazione
    assert.match(src, /const\s+splitDifferenceRaw\s*=\s*billTotal\s*-\s*enteredTotal/);
    assert.doesNotMatch(src, /Math\.abs\(splitDifference\)\s*<=/);
  });

  test("successo: con somma corretta il salvataggio è consentito e invia type custom", () => {
    // customSplitValid abilita il bottone (disabled solo quando invalido) e l'handler invia custom
    assert.match(src, /disabled=\{!customSplitValid\}/);
    assert.match(src, /apiRequest\(\s*["'`]PUT["'`][\s\S]{0,80}type:\s*["'`]custom["'`]/);
  });

  test("errore mismatch dal BE gestito (VALIDATION_ERROR)", () => {
    assert.match(src, /VALIDATION_ERROR/);
  });

  test("la funzione personalizzata è gated dietro Premium (isSubscribed)", () => {
    // tutta la sezione ripartizione richiede isSubscribed, e l'handler reindirizza a /premium
    assert.match(src, /handleSplitCustom[\s\S]{0,200}isSubscribed/);
  });
});

describe("Backend splits supporta custom con validazione (server/routes/bills.ts)", () => {
  const src = read("server/routes/bills.ts");

  test("accetta type 'custom' e array splits {memberId, amount}", () => {
    assert.match(src, /type:\s*z\.enum\(\[['"]equal['"],\s*['"]custom['"]\]\)/);
    assert.match(src, /splits:\s*z\.array/);
  });

  test("valida che la somma coincida con l'importo (tolleranza 0.01)", () => {
    assert.match(src, /Math\.abs\(splitTotal\s*-\s*Number\(bill\.amount\)\)\s*>\s*0\.01/);
  });

  test("valida l'appartenenza dei membri alla famiglia", () => {
    assert.match(src, /INVALID_MEMBER/);
  });

  test("la rotta splits richiede Premium", () => {
    assert.match(src, /splits['"][\s\S]{0,120}requirePremium\(\)/);
  });
});

describe("Query frontend bollette usano endpoint espliciti", () => {
  const files = ["app/(tabs)/bills.tsx", "app/add-bill.tsx", "app/bill/[id].tsx"];

  for (const f of files) {
    test(`${f}: nessuna queryKey in forma ["/api/bills", familyId, ...]`, () => {
      const src = read(f);
      // La vecchia forma con array multi-elemento non deve più comparire.
      assert.doesNotMatch(src, /\[\s*["'`]\/api\/bills["'`]\s*,/);
    });

    test(`${f}: usa URL espliciti /api/bills/\${familyId}...`, () => {
      const src = read(f);
      assert.match(src, /\/api\/bills\/\$\{familyId\}/);
    });
  }
});
