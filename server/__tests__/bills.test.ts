import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeBillStatus,
  computeBillReminders,
  canCreateBill,
  splitEqually,
  FREE_MAX_ACTIVE_BILLS,
  toDateString,
} from "../lib/bills";

const NOW = new Date("2026-06-28T12:00:00.000Z");

describe("computeBillStatus", () => {
  test("bolletta pagata -> pagata (anche se la scadenza è passata)", () => {
    assert.equal(
      computeBillStatus({ status: "pagata", dueDate: "2026-01-01" }, NOW),
      "pagata",
    );
  });

  test("scadenza futura e non pagata -> da_pagare", () => {
    assert.equal(
      computeBillStatus({ status: "da_pagare", dueDate: "2026-07-15" }, NOW),
      "da_pagare",
    );
  });

  test("scadenza passata e non pagata -> scaduta (calcolata)", () => {
    assert.equal(
      computeBillStatus({ status: "da_pagare", dueDate: "2026-06-01" }, NOW),
      "scaduta",
    );
  });

  test("giorno stesso della scadenza -> NON ancora scaduta", () => {
    assert.equal(
      computeBillStatus({ status: "da_pagare", dueDate: toDateString(NOW) }, NOW),
      "da_pagare",
    );
  });
});

describe("computeBillReminders", () => {
  test("Free -> solo giorno scadenza + scaduta (2 promemoria)", () => {
    const r = computeBillReminders({
      dueDate: "2026-07-15",
      remindersEnabled: true,
      plan: "free",
      status: "da_pagare",
      now: NOW,
    });
    assert.deepEqual(
      r.map((x) => x.type),
      ["due_day", "overdue"],
    );
  });

  test("Premium -> 7gg/3gg/giorno/scaduta (4 promemoria)", () => {
    const r = computeBillReminders({
      dueDate: "2026-07-15",
      remindersEnabled: true,
      plan: "premium",
      status: "da_pagare",
      now: NOW,
    });
    assert.deepEqual(
      r.map((x) => x.type),
      ["7_days", "3_days", "due_day", "overdue"],
    );
  });

  test("date promemoria Premium corrette rispetto alla scadenza", () => {
    const r = computeBillReminders({
      dueDate: "2026-07-15",
      remindersEnabled: true,
      plan: "premium",
      now: NOW,
    });
    const byType = Object.fromEntries(r.map((x) => [x.type, x.date]));
    assert.equal(byType["7_days"], "2026-07-08");
    assert.equal(byType["3_days"], "2026-07-12");
    assert.equal(byType["due_day"], "2026-07-15");
    assert.equal(byType["overdue"], "2026-07-16");
  });

  test("promemoria disattivati -> nessun promemoria", () => {
    const r = computeBillReminders({
      dueDate: "2026-07-15",
      remindersEnabled: false,
      plan: "premium",
      now: NOW,
    });
    assert.equal(r.length, 0);
  });

  test("bolletta pagata -> nessun promemoria", () => {
    const r = computeBillReminders({
      dueDate: "2026-07-15",
      remindersEnabled: true,
      plan: "premium",
      status: "pagata",
      now: NOW,
    });
    assert.equal(r.length, 0);
  });

  test("isDue true per promemoria già passati", () => {
    const r = computeBillReminders({
      dueDate: "2026-06-25",
      remindersEnabled: true,
      plan: "premium",
      now: NOW,
    });
    const due = r.find((x) => x.type === "due_day");
    assert.equal(due?.isDue, true);
  });
});

describe("canCreateBill (limite Free)", () => {
  test("FREE_MAX_ACTIVE_BILLS è 5", () => {
    assert.equal(FREE_MAX_ACTIVE_BILLS, 5);
  });

  test("Free sotto il limite -> consentito", () => {
    assert.equal(canCreateBill("free", 4), true);
  });

  test("Free al limite -> bloccato", () => {
    assert.equal(canCreateBill("free", 5), false);
  });

  test("Premium -> sempre consentito anche oltre il limite", () => {
    assert.equal(canCreateBill("premium", 999), true);
  });
});

describe("splitEqually (ripartizione)", () => {
  test("divisione netta tra 2 -> quote uguali", () => {
    assert.deepEqual(splitEqually(100, 2), ["50.00", "50.00"]);
  });

  test("resto distribuito sulle prime quote, somma esatta", () => {
    const shares = splitEqually(100, 3);
    assert.deepEqual(shares, ["33.34", "33.33", "33.33"]);
    const sum = shares.reduce((s, x) => s + Math.round(parseFloat(x) * 100), 0);
    assert.equal(sum, 10000);
  });

  test("importo con centesimi, somma conservata", () => {
    const shares = splitEqually(99.99, 4);
    const sum = shares.reduce((s, x) => s + Math.round(parseFloat(x) * 100), 0);
    assert.equal(sum, 9999);
  });

  test("0 membri -> nessuna quota", () => {
    assert.deepEqual(splitEqually(100, 0), []);
  });
});
