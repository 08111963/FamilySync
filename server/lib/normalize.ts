const ITALIAN_STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le',
  'un', 'uno', 'una',
  'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'a', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'da', 'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
  'in', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
  'su', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'con', 'per', 'tra', 'fra',
  'e', 'ed', 'o', 'od',
  'che', 'non', 'se', 'come', 'più', 'piu',
  'anche', 'ci', 'ne', 'si',
]);

const UNIT_MAP: Record<string, string> = {
  pz: "pcs", pcs: "pcs", pezzo: "pcs", pezzi: "pcs",
  g: "g", gr: "g", grammi: "g",
  kg: "kg", kilo: "kg", chilo: "kg",
  ml: "ml", millilitri: "ml",
  l: "l", lt: "l", litro: "l", litri: "l",
};

export function parseQuantityString(raw: string | null | undefined): { quantity: number | null; unit: string | null } {
  if (!raw || raw.trim() === "") return { quantity: null, unit: null };
  const trimmed = raw.trim();

  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?$/);
  if (match) {
    const num = parseFloat(match[1].replace(",", "."));
    const rawUnit = (match[2] || "").toLowerCase();
    const unit = UNIT_MAP[rawUnit] || (rawUnit || null);
    return { quantity: isNaN(num) ? null : num, unit };
  }

  const numOnly = parseFloat(trimmed.replace(",", "."));
  if (!isNaN(numOnly)) return { quantity: numOnly, unit: null };

  return { quantity: null, unit: null };
}

export function normalizeItemName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"()[\]{}]/g, '');

  const tokens = cleaned
    .split(' ')
    .filter(t => t.length > 0 && !ITALIAN_STOPWORDS.has(t));

  if (tokens.length === 0) return cleaned.replace(/\s+/g, '');

  tokens.sort();
  return tokens.join(' ');
}
