import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRecurrenceRule,
  buildRecurrenceRule,
  recurrenceLabel,
  nextDueDate,
} from "../../shared/chore-recurrence";

// 2026-07-18 è un sabato (ISO 6).

test("parse: valori storici semplici", () => {
  assert.deepEqual(parseRecurrenceRule("daily"), {
    frequency: "daily", weekdays: [], weekday: null, monthDay: null,
  });
  assert.equal(parseRecurrenceRule("weekly")!.weekday, null);
  assert.equal(parseRecurrenceRule("monthly")!.monthDay, null);
});

test("parse: valori con parametri, dedup e sort", () => {
  assert.deepEqual(parseRecurrenceRule("daily:5,1,3,3")!.weekdays, [1, 3, 5]);
  assert.equal(parseRecurrenceRule("weekly:6")!.weekday, 6);
  assert.equal(parseRecurrenceRule("monthly:31")!.monthDay, 31);
});

test("parse: regole non valide", () => {
  assert.equal(parseRecurrenceRule("yearly"), null);
  assert.equal(parseRecurrenceRule(""), null);
  assert.equal(parseRecurrenceRule(null), null);
  assert.equal(parseRecurrenceRule("weekly:9"), null);
  assert.equal(parseRecurrenceRule("weekly:foo"), null);
  assert.equal(parseRecurrenceRule("weekly:1,2"), null);
  assert.equal(parseRecurrenceRule("daily:0,8"), null);
  assert.equal(parseRecurrenceRule("daily:"), null);
  assert.equal(parseRecurrenceRule("monthly:32"), null);
});

test("build: normalizzazione", () => {
  assert.equal(buildRecurrenceRule("daily"), "daily");
  assert.equal(buildRecurrenceRule("daily", { weekdays: [1, 2, 3, 4, 5, 6, 7] }), "daily");
  assert.equal(buildRecurrenceRule("daily", { weekdays: [5, 1, 3] }), "daily:1,3,5");
  assert.equal(buildRecurrenceRule("weekly", { weekday: 6 }), "weekly:6");
  assert.equal(buildRecurrenceRule("monthly", { monthDay: 15 }), "monthly:15");
});

test("label italiano", () => {
  assert.equal(recurrenceLabel("daily"), "giornaliera");
  assert.equal(recurrenceLabel("daily:1,3,5"), "giornaliera (lun, mer, ven)");
  assert.equal(recurrenceLabel("weekly:6"), "settimanale (sabato)");
  assert.equal(recurrenceLabel("weekly"), "settimanale");
  assert.equal(recurrenceLabel("monthly:15"), "mensile (il 15)");
});

test("nextDueDate: daily semplice", () => {
  assert.equal(nextDueDate("daily", "2026-07-18"), "2026-07-19");
});

test("nextDueDate: daily con giorni (lun-mer-ven)", () => {
  // Da sabato 18/7 → lunedì 20/7
  assert.equal(nextDueDate("daily:1,3,5", "2026-07-18"), "2026-07-20");
  // Da lunedì 20/7 → mercoledì 22/7
  assert.equal(nextDueDate("daily:1,3,5", "2026-07-20"), "2026-07-22");
});

test("nextDueDate: weekly", () => {
  // Ogni sabato, da sabato → sabato successivo
  assert.equal(nextDueDate("weekly:6", "2026-07-18"), "2026-07-25");
  // Ogni domenica, da sabato → il giorno dopo
  assert.equal(nextDueDate("weekly:7", "2026-07-18"), "2026-07-19");
  // weekly senza giorno: stesso giorno settimana successiva
  assert.equal(nextDueDate("weekly", "2026-07-18"), "2026-07-25");
});

test("nextDueDate: monthly con clamp fine mese", () => {
  assert.equal(nextDueDate("monthly:15", "2026-07-18"), "2026-08-15");
  assert.equal(nextDueDate("monthly:15", "2026-07-10"), "2026-07-15");
  // 31 in un mese da 30 giorni → ultimo giorno
  assert.equal(nextDueDate("monthly:31", "2026-08-31"), "2026-09-30");
  // febbraio
  assert.equal(nextDueDate("monthly:31", "2027-01-31"), "2027-02-28");
  // monthly senza giorno: stesso giorno mese successivo
  assert.equal(nextDueDate("monthly", "2026-07-18"), "2026-08-18");
});

test("nextDueDate: regola o data non valida", () => {
  assert.equal(nextDueDate("yearly", "2026-07-18"), null);
  assert.equal(nextDueDate("daily", "not-a-date"), null);
});
