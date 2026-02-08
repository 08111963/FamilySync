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
