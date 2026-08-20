const INVITE_PATH = /^\/join(-link)?\/[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PENDING_RETURN_TO_STORAGE_KEY = "@family_sync_pending_return_to";

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Valida le sole destinazioni interne che possono attraversare login,
 * verifica email e onboarding. Ricostruisce il percorso in forma canonica:
 * nessun protocollo, host, fragment, parametro extra o chiave duplicata.
 */
export function safeReturnTo(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw || raw.includes("\\") || raw.startsWith("//")) {
    return undefined;
  }
  if (INVITE_PATH.test(raw)) return raw;

  let parsed: URL;
  try {
    parsed = new URL(raw, "https://familysync.invalid");
  } catch {
    return undefined;
  }
  if (
    parsed.origin !== "https://familysync.invalid" ||
    parsed.pathname !== "/chores" ||
    parsed.hash
  ) {
    return undefined;
  }

  const allowedKeys = new Set(["familyId", "date", "choreId"]);
  const keys = Array.from(parsed.searchParams.keys());
  if (
    keys.length !== allowedKeys.size ||
    keys.some((key) => !allowedKeys.has(key)) ||
    Array.from(allowedKeys).some((key) => parsed.searchParams.getAll(key).length !== 1)
  ) {
    return undefined;
  }

  const familyId = parsed.searchParams.get("familyId") || "";
  const date = parsed.searchParams.get("date") || "";
  const choreId = parsed.searchParams.get("choreId") || "";
  if (!UUID.test(familyId) || !UUID.test(choreId) || !isRealIsoDate(date)) {
    return undefined;
  }

  const query = new URLSearchParams({ familyId, date, choreId });
  return `/chores?${query.toString()}`;
}

export function firstStringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}