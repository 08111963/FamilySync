/**
 * Riconosce una violazione di vincolo UNIQUE Postgres (SQLSTATE 23505),
 * usata per gestire le race condition tra un check di esistenza e l'insert.
 * Non dipende dal driver: ispeziona sia il codice errore sia il messaggio.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: string })?.code;
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /unique|duplicate|23505/i.test(message);
}
