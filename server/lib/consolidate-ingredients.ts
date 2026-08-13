// Accorpamento intelligente degli ingredienti del piano pasti per la lista
// della spesa: l'AI scrive lo stesso ingrediente in modi diversi ("olio
// extravergine d'oliva", "olio extravergine d'oliva (insalata)", "olio
// extravergine d'oliva per condire") e la dedup sul nome esatto non basta.
// Qui calcoliamo una chiave canonica che ignora note tra parentesi, finalità
// ("per condire", "da servire"), aggettivi descrittivi e singolare/plurale,
// e sommiamo le quantità quando le unità sono compatibili.
import { normalizeItemName } from './normalize';

// Aggettivi/note che non cambiano il prodotto da comprare.
const DESCRIPTORS = new Set([
  'fresco', 'fresca', 'freschi', 'fresche',
  'caldo', 'calda', 'caldi', 'calde',
  'tritato', 'tritata', 'tritati', 'tritate',
  'grattugiato', 'grattugiata', 'grattugiati', 'grattugiate',
  'maturo', 'matura', 'maturi', 'mature',
  'opzionale', 'opzionali',
  'facoltativo', 'facoltativa', 'facoltativi', 'facoltative',
  'extra',
]);

/**
 * Chiave canonica di un ingrediente per l'accorpamento.
 * Esempi: "olio extravergine d'oliva (insalata)" e "Olio extravergine
 * d'oliva per condire" producono la stessa chiave; idem "arancia"/"arance".
 */
export function canonicalIngredientKey(name: string): string {
  let s = name.toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');       // note tra parentesi
  s = s.split(',')[0]!;                    // dopo la virgola = nota d'uso
  s = s.replace(/\s+(per|da)\s+.*$/, ' '); // finalità: "per condire", "da servire"

  const base = normalizeItemName(s);       // punteggiatura, stopword, sort
  const toks = base
    .split(' ')
    .filter((t) => t.length > 0 && !DESCRIPTORS.has(t))
    // Singolare/plurale italiano: tronca le vocali finali dei token lunghi
    // ("arancia"/"arance" -> "aranc", "zucchina"/"zucchine" -> "zucchin").
    .map((t) => (t.length > 3 ? t.replace(/[aeiou]+$/, '') : t))
    .filter((t) => t.length > 0);

  if (toks.length === 0) return base;
  toks.sort();
  return toks.join(' ');
}

// Unità sinonime -> forma canonica; conversioni verso l'unità base.
const UNIT_SYNONYMS: Record<string, string> = {
  pz: 'pcs', pcs: 'pcs', pezzo: 'pcs', pezzi: 'pcs',
  g: 'g', gr: 'g', grammi: 'g', grammo: 'g',
  kg: 'kg', chilo: 'kg', chili: 'kg',
  ml: 'ml', millilitri: 'ml',
  l: 'l', lt: 'l', litro: 'l', litri: 'l',
  cucchiaio: 'cucchiaio', cucchiai: 'cucchiaio',
  cucchiaino: 'cucchiaino', cucchiaini: 'cucchiaino',
  spicchio: 'spicchio', spicchi: 'spicchio',
  rametto: 'rametto', rametti: 'rametto',
  fetta: 'fette', fette: 'fette',
};
// Conversioni verso l'unità piccola della stessa famiglia.
const UNIT_CONVERSIONS: Record<string, { to: string; factor: number }> = {
  kg: { to: 'g', factor: 1000 },
  l: { to: 'ml', factor: 1000 },
};

function canonicalUnit(unit: string | null): string | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase();
  if (u === '') return null;
  return UNIT_SYNONYMS[u] ?? u;
}

export interface IngredientEntry {
  name: string;
  quantity: string | null; // stringa numerica per colonna NUMERIC, o null
  unit: string | null;
  category: string | null;
}

/**
 * Accorpa gli ingredienti con la stessa chiave canonica.
 * - Nome: viene tenuto il più corto (il più generico).
 * - Quantità: sommate quando le unità sono uguali o convertibili
 *   (kg->g, l->ml); le voci con unità non compatibili vengono ignorate
 *   nella somma (meglio una quantità parziale che un doppione in lista).
 */
export function consolidateIngredients(entries: IngredientEntry[]): IngredientEntry[] {
  const groups = new Map<string, IngredientEntry[]>();
  const order: string[] = [];
  for (const e of entries) {
    if (!e.name) continue;
    const key = canonicalIngredientKey(e.name);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(e);
    else { groups.set(key, [e]); order.push(key); }
  }

  const out: IngredientEntry[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    if (group.length === 1) { out.push(group[0]!); continue; }

    // Nome più generico = il più corto (a parità, il primo incontrato).
    let best = group[0]!;
    for (const e of group) {
      if (e.name.trim().length < best.name.trim().length) best = e;
    }

    // Somma delle quantità nella famiglia di unità della prima voce numerica.
    let sum: number | null = null;
    let sumUnit: string | null = null;
    for (const e of group) {
      const qty = e.quantity != null ? Number(e.quantity) : NaN;
      if (!Number.isFinite(qty)) continue;
      let u = canonicalUnit(e.unit);
      let v = qty;
      const conv = u ? UNIT_CONVERSIONS[u] : undefined;
      if (conv) { u = conv.to; v = qty * conv.factor; }
      if (sum === null) { sum = v; sumUnit = u; }
      else if (u === sumUnit) { sum += v; }
      // Unità diversa e non convertibile: ignorata nella somma.
    }

    out.push({
      name: best.name,
      quantity: sum !== null ? String(Math.round(sum * 100) / 100) : best.quantity,
      unit: sum !== null ? sumUnit : best.unit,
      category: best.category ?? group.find((e) => e.category)?.category ?? null,
    });
  }
  return out;
}
