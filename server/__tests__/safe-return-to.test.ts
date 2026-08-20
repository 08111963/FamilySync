import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "../../lib/safe-return-to";

const FAMILY_ID = "686d84c8-d67c-4690-90aa-bd7c7d5cf020";
const CHORE_ID = "39a8d066-da47-4c03-834f-e76000c5953d";

test("accetta inviti e link faccenda interni in forma canonica", () => {
  assert.equal(safeReturnTo("/join/token_123"), "/join/token_123");
  assert.equal(
    safeReturnTo(`/chores?choreId=${CHORE_ID}&date=2026-09-20&familyId=${FAMILY_ID}`),
    `/chores?familyId=${FAMILY_ID}&date=2026-09-20&choreId=${CHORE_ID}`,
  );
});

test("rifiuta redirect esterni e link faccenda alterati", () => {
  assert.equal(safeReturnTo("https://evil.example/chores"), undefined);
  assert.equal(safeReturnTo("//evil.example/chores"), undefined);
  assert.equal(
    safeReturnTo(`/chores?familyId=${FAMILY_ID}&date=2026-09-20&choreId=${CHORE_ID}#fragment`),
    undefined,
  );
  assert.equal(
    safeReturnTo(`/chores?familyId=${FAMILY_ID}&date=2026-02-30&choreId=${CHORE_ID}`),
    undefined,
  );
  assert.equal(
    safeReturnTo(`/chores?familyId=${FAMILY_ID}&date=2026-09-20&choreId=${CHORE_ID}&next=https://evil.example`),
    undefined,
  );
  assert.equal(
    safeReturnTo(`/chores?familyId=${FAMILY_ID}&familyId=${FAMILY_ID}&date=2026-09-20&choreId=${CHORE_ID}`),
    undefined,
  );
});