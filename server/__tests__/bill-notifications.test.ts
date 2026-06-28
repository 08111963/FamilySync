import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeBillNotificationTriggers,
  billNotificationSignature,
  reconcileBillNotifications,
  offsetsForPlan,
  formatEuro,
  type NotifiableBill,
  type StoredBillNotification,
} from "../../lib/bill-notifications";

function bill(overrides: Partial<NotifiableBill> = {}): NotifiableBill {
  return {
    id: "b1",
    title: "Luce",
    amount: "42.50",
    dueDate: "2026-12-20",
    status: "da_pagare",
    remindersEnabled: true,
    ...overrides,
  };
}

describe("offsetsForPlan", () => {
  test("Premium ha 7/3/0/-1", () => {
    assert.deepEqual(offsetsForPlan("premium"), [7, 3, 0, -1]);
  });
  test("Free ha solo giorno/scaduta", () => {
    assert.deepEqual(offsetsForPlan("free"), [0, -1]);
  });
});

describe("formatEuro", () => {
  test("formatta con virgola", () => {
    assert.equal(formatEuro("42.5"), "€ 42,50");
    assert.equal(formatEuro(0), "€ 0,00");
  });
});

describe("computeBillNotificationTriggers", () => {
  const now = new Date(2026, 11, 1, 8, 0, 0); // 1 dic 2026

  test("Premium: 4 trigger futuri (7,3,0,-1)", () => {
    const triggers = computeBillNotificationTriggers(bill(), "premium", now);
    assert.equal(triggers.length, 4);
    // tutte le date sono future
    for (const t of triggers) assert.ok(t.date.getTime() > now.getTime());
    // tutte alle 09:00
    for (const t of triggers) assert.equal(t.date.getHours(), 9);
  });

  test("Free: solo 2 trigger (giorno + scaduta)", () => {
    const triggers = computeBillNotificationTriggers(bill(), "free", now);
    assert.equal(triggers.length, 2);
  });

  test("bolletta pagata: nessun trigger", () => {
    const triggers = computeBillNotificationTriggers(bill({ status: "pagata" }), "premium", now);
    assert.equal(triggers.length, 0);
  });

  test("promemoria disattivati: nessun trigger", () => {
    const triggers = computeBillNotificationTriggers(bill({ remindersEnabled: false }), "premium", now);
    assert.equal(triggers.length, 0);
  });

  test("solo i trigger futuri (scadenza vicina salta i giorni passati)", () => {
    // scadenza fra 2 giorni: 7 e 3 giorni prima sono nel passato, restano 0 e -1
    const close = new Date(2026, 11, 18, 8, 0, 0);
    const triggers = computeBillNotificationTriggers(bill({ dueDate: "2026-12-20" }), "premium", close);
    const keys = triggers.map((t) => t.key).sort();
    assert.deepEqual(keys, ["-1", "0"]);
  });

  test("scadenza nel passato: nessun trigger", () => {
    const past = new Date(2027, 0, 1, 8, 0, 0);
    const triggers = computeBillNotificationTriggers(bill(), "premium", past);
    assert.equal(triggers.length, 0);
  });

  test("dueDate non valida: nessun trigger (no crash)", () => {
    const triggers = computeBillNotificationTriggers(bill({ dueDate: "boh" }), "premium", now);
    assert.equal(triggers.length, 0);
  });
});

describe("billNotificationSignature", () => {
  test("cambia se cambia il titolo (compare nel testo notifica)", () => {
    const a = billNotificationSignature(bill({ title: "Luce" }), "premium");
    const b = billNotificationSignature(bill({ title: "Gas" }), "premium");
    assert.notEqual(a, b);
  });
  test("cambia se cambia l'importo (compare nel testo notifica)", () => {
    const a = billNotificationSignature(bill({ amount: "42.50" }), "premium");
    const b = billNotificationSignature(bill({ amount: "99.00" }), "premium");
    assert.notEqual(a, b);
  });
  test("cambia se cambia la scadenza", () => {
    const a = billNotificationSignature(bill({ dueDate: "2026-12-20" }), "premium");
    const b = billNotificationSignature(bill({ dueDate: "2026-12-21" }), "premium");
    assert.notEqual(a, b);
  });
  test("cambia se cambia lo stato (pagata)", () => {
    const a = billNotificationSignature(bill({ status: "da_pagare" }), "premium");
    const b = billNotificationSignature(bill({ status: "pagata" }), "premium");
    assert.notEqual(a, b);
  });
  test("cambia se cambia il piano", () => {
    const a = billNotificationSignature(bill(), "premium");
    const b = billNotificationSignature(bill(), "free");
    assert.notEqual(a, b);
  });
});

describe("reconcileBillNotifications", () => {
  function stored(map: Record<string, string>): Record<string, StoredBillNotification> {
    const out: Record<string, StoredBillNotification> = {};
    for (const [k, sig] of Object.entries(map)) out[k] = { signature: sig, notifIds: ["n-" + k] };
    return out;
  }

  test("nuova bolletta -> da programmare", () => {
    const res = reconcileBillNotifications([{ billId: "b1", signature: "s1" }], {});
    assert.deepEqual(res.toScheduleBillIds, ["b1"]);
    assert.deepEqual(res.toCancelBillIds, []);
  });

  test("firma invariata -> nessuna azione", () => {
    const res = reconcileBillNotifications([{ billId: "b1", signature: "s1" }], stored({ b1: "s1" }));
    assert.deepEqual(res.toScheduleBillIds, []);
    assert.deepEqual(res.toCancelBillIds, []);
  });

  test("firma cambiata (es. dueDate) -> cancella e riprogramma", () => {
    const res = reconcileBillNotifications([{ billId: "b1", signature: "s2" }], stored({ b1: "s1" }));
    assert.deepEqual(res.toScheduleBillIds, ["b1"]);
    assert.deepEqual(res.toCancelBillIds, ["b1"]);
  });

  test("bolletta eliminata/pagata fuori lista -> cancella", () => {
    const res = reconcileBillNotifications([], stored({ b1: "s1" }));
    assert.deepEqual(res.toCancelBillIds, ["b1"]);
    assert.deepEqual(res.toScheduleBillIds, []);
  });
});
