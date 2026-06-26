import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  shouldReceiveTyping,
  getBlockRelatedCached,
  invalidateBlockCache,
  __setBlockRelatedFetcherForTest,
  __setNowForTest,
  __resetBlockCacheTestHooks,
} from "../lib/websocket";

const A = "user-A";
const B = "user-B";
const C = "user-C";
const FAM = "family-1";

afterEach(() => {
  __resetBlockCacheTestHooks();
});

describe("Caso 4 — chat:typing tra utenti bloccati", () => {
  test("A blocca B -> A non riceve il typing di B; C lo riceve", () => {
    // B sta scrivendo (author = B). Relazione di blocco bidirezionale: {A}.
    const blockedRelatedForB = new Set([A]);
    assert.equal(shouldReceiveTyping(A, B, blockedRelatedForB), false, "A non deve ricevere");
    assert.equal(shouldReceiveTyping(C, B, blockedRelatedForB), true, "C deve ricevere");
  });

  test("B blocca A -> A continua a non ricevere il typing di B (bidirezionale)", () => {
    // Anche se e' B ad essere bloccato/bloccante, la relazione e' simmetrica.
    const blockedRelatedForB = new Set([A]);
    assert.equal(shouldReceiveTyping(A, B, blockedRelatedForB), false);
  });

  test("l'autore non riceve mai il proprio typing", () => {
    assert.equal(shouldReceiveTyping(B, B, new Set()), false);
  });

  test("utente non coinvolto riceve sempre quando non c'e' blocco", () => {
    assert.equal(shouldReceiveTyping(C, B, new Set()), true);
  });

  test("socket senza userId non riceve", () => {
    assert.equal(shouldReceiveTyping(undefined, B, new Set()), false);
  });
});

describe("Caso 5 — la cache di 30s non lascia passare typing dopo un blocco appena creato", () => {
  beforeEach(() => {
    __resetBlockCacheTestHooks();
  });

  test("invalidare la cache dopo un blocco forza il refetch immediato", async () => {
    let calls = 0;
    let relatedIds: string[] = []; // inizialmente nessun blocco

    __setBlockRelatedFetcherForTest(async () => {
      calls += 1;
      return relatedIds;
    });

    // Prima lettura: nessun blocco -> A riceverebbe il typing di B.
    let related = await getBlockRelatedCached(FAM, B);
    assert.equal(calls, 1);
    assert.equal(shouldReceiveTyping(A, B, related), true);

    // Seconda lettura entro il TTL: servita dalla cache, nessun nuovo fetch.
    related = await getBlockRelatedCached(FAM, B);
    assert.equal(calls, 1, "deve usare la cache");
    assert.equal(shouldReceiveTyping(A, B, related), true);

    // Ora A blocca B: il blocco e' appena creato e la cache viene invalidata.
    relatedIds = [A];
    invalidateBlockCache(FAM, B);
    invalidateBlockCache(FAM, A);

    // Lettura successiva: refetch immediato, A NON deve piu' ricevere.
    related = await getBlockRelatedCached(FAM, B);
    assert.equal(calls, 2, "dopo l'invalidazione deve rifare il fetch");
    assert.equal(shouldReceiveTyping(A, B, related), false, "A non deve ricevere dopo il blocco");
  });

  test("senza invalidazione la cache trattiene il vecchio valore fino allo scadere del TTL", async () => {
    let calls = 0;
    let relatedIds: string[] = [];
    let fakeNow = 1_000_000;

    __setNowForTest(() => fakeNow);
    __setBlockRelatedFetcherForTest(async () => {
      calls += 1;
      return relatedIds;
    });

    await getBlockRelatedCached(FAM, B);
    assert.equal(calls, 1);

    // Cambia lo stato dei blocchi ma NON invalida: entro 30s resta cache vecchia.
    relatedIds = [A];
    fakeNow += 29_000; // < 30s
    let related = await getBlockRelatedCached(FAM, B);
    assert.equal(calls, 1, "ancora in cache entro il TTL");
    assert.equal(shouldReceiveTyping(A, B, related), true, "vecchio valore: A riceve ancora");

    // Superato il TTL: refetch e ora riflette il blocco.
    fakeNow += 2_000; // ora > 30s totali
    related = await getBlockRelatedCached(FAM, B);
    assert.equal(calls, 2, "scaduto il TTL deve rifare il fetch");
    assert.equal(shouldReceiveTyping(A, B, related), false);
  });
});
