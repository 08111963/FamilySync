import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isUniqueViolation } from "../lib/db-errors";

describe("isUniqueViolation (race PLAN_EXISTS)", () => {
  test("codice SQLSTATE 23505 -> true", () => {
    assert.equal(isUniqueViolation({ code: "23505" }), true);
  });

  test("messaggio con 'duplicate key value' -> true", () => {
    assert.equal(
      isUniqueViolation(new Error('duplicate key value violates unique constraint "meal_plans_family_week"')),
      true,
    );
  });

  test("messaggio con 'unique' -> true", () => {
    assert.equal(isUniqueViolation(new Error("UNIQUE constraint failed")), true);
  });

  test("errore generico -> false", () => {
    assert.equal(isUniqueViolation(new Error("connection reset")), false);
  });

  test("null/undefined -> false", () => {
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation(undefined), false);
  });

  test("oggetto senza code né messaggio rilevante -> false", () => {
    assert.equal(isUniqueViolation({ foo: "bar" }), false);
  });
});
