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
  test("Premium ha 7/3/1/0", () => {
    assert.deepEqual(offsetsForPlan("premium"), [7, 3, 1, 0]);
  });
  test("Free ha 1 giorno prima + giorno della scadenza", () => {
    assert.deepEqual(offsetsForPlan("free"), [1, 0]);
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

  test("Premium: 4 trigger futuri (7,3,1,0)", () => {
    const triggers = computeBillNotificationTriggers(bill(), "premium", now);
    assert.equal(triggers.length, 4);
    // tutte le date sono future
    for (const t of triggers) assert.ok(t.date.getTime() > now.getTime());
    // tutte alle 08:00
    for (const t of triggers) assert.equal(t.date.getHours(), 8);
  });

  test("Free: solo 2 trigger (1 giorno prima + giorno scadenza)", () => {
    const triggers = computeBillNotificationTriggers(bill(), "free", now);
    assert.equal(triggers.length, 2);
    assert.deepEqual(triggers.map((t) => t.key).sort(), ["0", "1"]);
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
    // scadenza fra 2 giorni: 7 e 3 giorni prima sono nel passato, restano 1 e 0
    const close = new Date(2026, 11, 18, 9, 0, 0);
    const triggers = computeBillNotificationTriggers(bill({ dueDate: "2026-12-20" }), "premium", close);
    const keys = triggers.map((t) => t.key).sort();
    assert.deepEqual(keys, ["0", "1"]);
  });

  test("scadenza nel passato: nessun trigger", () => {
    const past = new Date(2027, 0, 1, 8, 0, 0);
    const triggers = computeBillNotificationTriggers(bill(), "premium", past);
    assert.equal(triggers.length, 0);
  });

  test("titolo corretto per il trigger del giorno prima", () => {
    const triggers = computeBillNotificationTriggers(bill(), "premium", now);
    const dayBefore = triggers.find((t) => t.key === "1");
    assert.ok(dayBefore);
    assert.equal(dayBefore.title, "Bolletta in scadenza domani");
  });

  test("dueDate non valida: nessun trigger (no crash)", () => {
    const triggers = computeBillNotificationTriggers(bill({ dueDate: "boh" }), "premium", now);
    assert.equal(triggers.length, 0);
  });

  test("date personalizzate: aggiungono trigger futuri alle 08:00", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-12-05", "2026-12-10"] }),
      "free",
      now
    );
    const custom = triggers.filter((t) => t.key.startsWith("custom:"));
    assert.equal(custom.length, 2);
    for (const t of custom) {
      assert.ok(t.date.getTime() > now.getTime());
      assert.equal(t.date.getHours(), 8);
      assert.equal(t.title, "Promemoria bolletta");
    }
  });

  test("date personalizzate passate: ignorate", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-11-01"] }),
      "free",
      now
    );
    assert.equal(triggers.filter((t) => t.key.startsWith("custom:")).length, 0);
  });

  test("date personalizzate: nessun duplicato se coincide con un offset automatico", () => {
    // 2026-12-19 = 1 giorno prima della scadenza 2026-12-20 (offset free)
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-12-19"] }),
      "free",
      now
    );
    assert.equal(triggers.filter((t) => t.key.startsWith("custom:")).length, 0);
    assert.equal(triggers.length, 2);
  });

  test("date personalizzate: ignorate se promemoria disattivati", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ remindersEnabled: false, customReminderDates: ["2026-12-05"] }),
      "premium",
      now
    );
    assert.equal(triggers.length, 0);
  });

  test("date personalizzate non valide: ignorate (no crash)", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["boh", "2026-13-40", "2026-12-05"] as string[] }),
      "free",
      now
    );
    assert.equal(triggers.filter((t) => t.key.startsWith("custom:")).length, 1);
  });

  test("promemoria con orario: scatta all'ora scelta (non alle 08:00)", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-12-05T15:30"] }),
      "free",
      now
    );
    const custom = triggers.filter((t) => t.key.startsWith("custom:"));
    assert.equal(custom.length, 1);
    assert.equal(custom[0].date.getHours(), 15);
    assert.equal(custom[0].date.getMinutes(), 30);
  });

  test("promemoria stesso giorno più tardi: scatta (non saltato come le 08:00)", () => {
    // now = 1 dic 08:00; un promemoria oggi alle 20:00 è futuro e deve scattare
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-12-01T20:00"] }),
      "free",
      now
    );
    const custom = triggers.filter((t) => t.key.startsWith("custom:"));
    assert.equal(custom.length, 1);
    assert.equal(custom[0].date.getHours(), 20);
  });

  test("promemoria con orario nel passato: ignorato", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-12-01T07:00"] }),
      "free",
      now
    );
    assert.equal(triggers.filter((t) => t.key.startsWith("custom:")).length, 0);
  });

  test("orario non valido (25:00): ignorato", () => {
    const triggers = computeBillNotificationTriggers(
      bill({ customReminderDates: ["2026-12-05T25:00", "2026-12-05T10:61"] as string[] }),
      "free",
      now
    );
    assert.equal(triggers.filter((t) => t.key.startsWith("custom:")).length, 0);
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
  test("cambia se cambiano le date personalizzate", () => {
    const a = billNotificationSignature(bill({ customReminderDates: ["2026-12-05"] }), "premium");
    const b = billNotificationSignature(bill({ customReminderDates: ["2026-12-06"] }), "premium");
    assert.notEqual(a, b);
  });
  test("stessa firma con date personalizzate in ordine diverso (normalizzate)", () => {
    const a = billNotificationSignature(bill({ customReminderDates: ["2026-12-06", "2026-12-05"] }), "premium");
    const b = billNotificationSignature(bill({ customReminderDates: ["2026-12-05", "2026-12-06"] }), "premium");
    assert.equal(a, b);
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
