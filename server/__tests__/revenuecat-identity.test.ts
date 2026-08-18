import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ensureRevenueCatIdentity,
  runWithRevenueCatIdentity,
  withRevenueCatIdentityLock,
  type RevenueCatIdentityDeps,
} from "../../lib/revenuecat-identity";

/**
 * MICRO-MANDATO sicurezza attribuzione acquisti RevenueCat:
 * A. cambio Famiglia A → B → purchase: il logIn su B completa PRIMA del purchase;
 * B. idem per restore;
 * C. logIn fallisce → purchase/restore NON vengono eseguiti.
 */

function makeDeps(calls: string[], opts: { failLogin?: boolean; failInit?: boolean; wrongIdentity?: boolean } = {}): RevenueCatIdentityDeps {
  let current = "family-A"; // identità RevenueCat rimasta sulla famiglia precedente
  return {
    initialize: () => {
      calls.push("initialize");
      if (opts.failInit) throw new Error("chiave RevenueCat mancante");
    },
    logIn: async (id: string) => {
      // login asincrono "lento": simula il cambio famiglia non ancora completato
      await new Promise((r) => setTimeout(r, 10));
      calls.push(`logIn:${id}`);
      if (opts.failLogin) throw new Error("logIn fallito");
      current = opts.wrongIdentity ? "family-A" : id;
    },
    getAppUserID: async () => current,
  };
}

describe("attribuzione acquisti RevenueCat alla famiglia corrente", () => {
  test("A. cambio A→B: il logIn su B completa PRIMA del purchase", async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    await runWithRevenueCatIdentity(deps, "family-B", async () => {
      calls.push("purchase");
    });
    assert.deepEqual(calls, ["initialize", "logIn:family-B", "purchase"]);
  });

  test("B. cambio A→B: il logIn su B completa PRIMA del restore", async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    await runWithRevenueCatIdentity(deps, "family-B", async () => {
      calls.push("restore");
    });
    assert.deepEqual(calls, ["initialize", "logIn:family-B", "restore"]);
  });

  test("C1. logIn fallisce → purchase/restore NON eseguiti", async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { failLogin: true });
    await assert.rejects(
      runWithRevenueCatIdentity(deps, "family-B", async () => {
        calls.push("purchase");
      }),
      /logIn fallito/,
    );
    assert.ok(!calls.includes("purchase"));
  });

  test("C2. inizializzazione fallisce → errore propagato, azione NON eseguita", async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { failInit: true });
    await assert.rejects(
      runWithRevenueCatIdentity(deps, "family-B", async () => {
        calls.push("purchase");
      }),
      /chiave RevenueCat mancante/,
    );
    assert.ok(!calls.includes("purchase"));
  });

  test("C3. familyId mancante → azione NON eseguita, nessun logIn", async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    await assert.rejects(
      runWithRevenueCatIdentity(deps, undefined, async () => {
        calls.push("purchase");
      }),
      /Nessuna famiglia selezionata/,
    );
    assert.deepEqual(calls, []);
  });

  test("C4. identità finale diversa dalla famiglia richiesta → bloccato", async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { wrongIdentity: true });
    await assert.rejects(
      ensureRevenueCatIdentity(deps, "family-B"),
      /non corrispondente/,
    );
  });
});

describe("race con login concorrente da cambio famiglia", () => {
  test("un logIn concorrente non può inserirsi tra verifica e purchase", async () => {
    const calls: string[] = [];
    let current = "family-A";
    const deps: RevenueCatIdentityDeps = {
      initialize: () => {},
      logIn: async (id: string) => {
        await new Promise((r) => setTimeout(r, 5));
        calls.push(`logIn:${id}`);
        current = id;
      },
      getAppUserID: async () => current,
    };

    // Transazione d'acquisto su B; DURANTE la transazione parte il login
    // "anticipato" del cambio famiglia verso C (come farebbe FamilyContext).
    const purchase = runWithRevenueCatIdentity(deps, "family-B", async () => {
      calls.push(`purchase:${current}`);
      await new Promise((r) => setTimeout(r, 15));
      calls.push(`purchase-end:${current}`);
    });
    const concurrentSwitch = withRevenueCatIdentityLock(() => deps.logIn("family-C"));

    await Promise.all([purchase, concurrentSwitch]);

    // Il purchase deve INIZIARE e FINIRE con identità family-B: il login su C
    // è stato accodato DOPO l'intera transazione.
    assert.deepEqual(calls, [
      "logIn:family-B",
      "purchase:family-B",
      "purchase-end:family-B",
      "logIn:family-C",
    ]);
  });

  test("una transazione fallita non blocca la coda successiva", async () => {
    const calls: string[] = [];
    let current = "x";
    const deps: RevenueCatIdentityDeps = {
      initialize: () => {},
      logIn: async (id: string) => { calls.push(`logIn:${id}`); current = id; },
      getAppUserID: async () => current,
    };
    await assert.rejects(
      runWithRevenueCatIdentity(deps, "fam-1", async () => { throw new Error("purchase KO"); }),
      /purchase KO/,
    );
    await runWithRevenueCatIdentity(deps, "fam-2", async () => { calls.push("ok"); });
    assert.deepEqual(calls, ["logIn:fam-1", "logIn:fam-2", "ok"]);
  });
});
