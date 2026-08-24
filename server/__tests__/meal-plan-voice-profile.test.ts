import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detectMealPlanDietProfileFromText,
  mealPlanVoiceDietRequiresReselection,
  resolveMealPlanVoiceDiet,
} from "../../shared/meal-plan-diet-profiles";
import { prepareMealPlanPreferences } from "../routes/ai";

test("la voce non degrada diete storiche o combinazioni non rappresentabili", () => {
  for (const spoken of [
    "Vorrei una dieta vegetariana senza glutine",
    "vegetarian gluten free per tutta la settimana",
    "pasti pescetariani",
    "dieta halal",
    "piano low carb",
    "Vorrei pasti senza glutine e senza lattosio",
    "gluten free e lactose free per tutta la settimana",
    "piano vegetariano e senza glutine",
    "menu mediterraneo vegetariano",
  ]) {
    assert.equal(mealPlanVoiceDietRequiresReselection(spoken), true, spoken);
    assert.equal(detectMealPlanDietProfileFromText(spoken), undefined, spoken);
  }
  assert.equal(
    detectMealPlanDietProfileFromText("Vorrei una mediterranea senza glutine"),
    "gluten_free",
  );
  assert.equal(
    detectMealPlanDietProfileFromText("Vorrei una mediterranea senza lattosio"),
    "lactose_free",
  );
  assert.equal(detectMealPlanDietProfileFromText("Vorrei un menu vegano"), "vegan");
  assert.equal(detectMealPlanDietProfileFromText("Vorrei una dieta sportiva"), "mediterranean");
});

test("blocco vocale, scelta manuale e richiesta server non inoltrano note sanitarie", async () => {
  const resolution = resolveMealPlanVoiceDiet("Vorrei una dieta vegetariana senza glutine");
  assert.deepEqual(resolution, { requiresReselection: true, voiceNotes: "" });
  const prepared = await prepareMealPlanPreferences(
    "voice-meal-plan-test-user",
    { dietProfile: "gluten_free", notes: resolution.voiceNotes },
    async () => true,
  );
  assert.equal(prepared.ok, true, "la scelta manuale deve arrivare al server senza note bloccanti");
});

test("il flusso voce chiede la scelta manuale prima di avviare lo stream", () => {
  const source = readFileSync("app/meal-plans/index.tsx", "utf8");
  const start = source.indexOf("const handleVoiceGenerate");
  const end = source.indexOf("const handleSavePlan", start);
  assert.ok(start >= 0 && end > start, "handler voce del Piano Pasti trovato");
  const handler = source.slice(start, end);
  const guard = handler.indexOf("resolution.requiresReselection");
  const stream = handler.indexOf("fetchMealPlanStream");
  assert.ok(guard >= 0, "la dettatura non rappresentabile deve essere gestita");
  assert.ok(stream > guard, "la guardia deve interrompere il flusso prima dello stream");
  assert.match(handler, /setGenerationError\([\s\S]*Scegli manualmente un profilo/i);
  assert.match(
    handler.slice(guard, stream),
    /setVoicePrefs\(resolution\.voiceNotes\)/,
    "una frase bloccata non deve restare nelle note della generazione manuale successiva",
  );
});