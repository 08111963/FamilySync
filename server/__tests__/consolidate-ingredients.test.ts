import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalIngredientKey, consolidateIngredients } from '../lib/consolidate-ingredients';

test('varianti di olio producono la stessa chiave', () => {
  const a = canonicalIngredientKey("Olio extravergine d'oliva");
  const b = canonicalIngredientKey("olio extravergine d'oliva (insalata)");
  const c = canonicalIngredientKey("olio extravergine d'oliva per condire");
  assert.equal(a, b);
  assert.equal(a, c);
});

test('singolare/plurale e descrittori accorpati', () => {
  assert.equal(canonicalIngredientKey('arancia'), canonicalIngredientKey('arance'));
  assert.equal(canonicalIngredientKey('zucchina'), canonicalIngredientKey('zucchine'));
  assert.equal(canonicalIngredientKey('rosmarino'), canonicalIngredientKey('Rosmarino fresco'));
  assert.equal(canonicalIngredientKey('banana'), canonicalIngredientKey('banana matura'));
  assert.equal(canonicalIngredientKey('latte fresco da servire'), canonicalIngredientKey('latte'));
});

test('prodotti diversi restano separati', () => {
  assert.notEqual(canonicalIngredientKey('ricotta salata'), canonicalIngredientKey('ricotta fresca'));
  assert.notEqual(canonicalIngredientKey('olio di semi'), canonicalIngredientKey("olio extravergine d'oliva"));
  assert.notEqual(canonicalIngredientKey('farina 00'), canonicalIngredientKey('farina di ceci'));
});

test('quantità sommate con unità uguali o convertibili', () => {
  const out = consolidateIngredients([
    { name: "Olio extravergine d'oliva", quantity: '3', unit: 'cucchiai', category: 'food' },
    { name: "olio extravergine d'oliva (insalata)", quantity: '1', unit: 'cucchiaio', category: 'food' },
    { name: 'brodo vegetale', quantity: '1.2', unit: 'l', category: 'food' },
    { name: 'brodo vegetale caldo', quantity: '900', unit: 'ml', category: 'food' },
  ]);
  assert.equal(out.length, 2);
  const olio = out.find((e) => e.name.toLowerCase().includes('olio'))!;
  assert.equal(olio.quantity, '4');
  assert.equal(olio.unit, 'cucchiaio');
  const brodo = out.find((e) => e.name.toLowerCase().includes('brodo'))!;
  assert.equal(brodo.quantity, '2100');
  assert.equal(brodo.unit, 'ml');
});

test('unità non compatibili: si tiene la somma parziale, nome più corto', () => {
  const out = consolidateIngredients([
    { name: 'limone (succo e scorza)', quantity: '1', unit: 'pezzi', category: 'food' },
    { name: 'limone (per condire)', quantity: '1', unit: 'pezzo', category: 'food' },
    { name: 'Limone', quantity: '1', unit: 'pezzi', category: 'food' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.name, 'Limone');
  assert.equal(out[0]!.quantity, '3');
});
