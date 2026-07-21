// La tabella shopping_items ha quantity NUMERIC e unit VARCHAR(10) separate:
// qui convertiamo quantità/unità libere (da ricette o ingredienti AI) in una
// coppia valida per il DB, senza mai passare testo alla colonna numerica.

const UNIT_MAX_LEN = 10;

export interface ShoppingQuantity {
  quantity: string | null; // stringa numerica valida per NUMERIC, o null
  unit: string | null;
}

export function toShoppingQuantity(
  rawQuantity: string | number | null | undefined,
  rawUnit: string | null | undefined,
): ShoppingQuantity {
  let quantity: string | null = null;
  let unit = rawUnit ? String(rawUnit).trim() : null;

  if (rawQuantity !== null && rawQuantity !== undefined && String(rawQuantity).trim() !== "") {
    const text = String(rawQuantity).trim().replace(",", ".");
    // Accetta anche "200 g" incollato: separa il numero iniziale dal resto.
    const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
    if (match && Number.isFinite(Number(match[1]))) {
      quantity = match[1]!;
      if (!unit && match[2]) unit = match[2]!.trim();
    } else if (!unit) {
      // Quantità non numerica ("q.b.", "un pizzico"): la usiamo come unità.
      unit = text;
    }
  }

  if (unit) {
    unit = unit.slice(0, UNIT_MAX_LEN);
    if (unit.length === 0) unit = null;
  }

  return { quantity, unit };
}
