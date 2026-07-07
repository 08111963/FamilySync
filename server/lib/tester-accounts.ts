/**
 * Account TESTER per il canale di test chiuso di Google Play Console.
 *
 * Crea 15 account con email già verificata e una PROVA gratuita di 15 giorni con
 * accesso a TUTTE le funzioni (Premium). La prova parte dal PRIMO login di ogni
 * account (vedi activatePendingTrialsForUser in entitlements.ts): l'entitlement
 * nasce "pending" con trialDays=15 e viene attivato al primo accesso. Alla
 * scadenza isPremium torna false → l'account continua a funzionare ma solo con
 * le funzioni free.
 *
 * Come l'account demo, il seeding gira all'avvio del server (vedi server/index.ts)
 * quindi funziona anche nel database di PRODUZIONE dopo il deploy, dove i tester
 * useranno l'app pubblicata.
 *
 * Le password NON sono salvate in chiaro da nessuna parte: sono derivate in modo
 * deterministico da SESSION_SECRET (secret globale, identico in dev e prod). Lo
 * stesso algoritmo genera il PDF con le credenziali (scripts/seed-tester-accounts.ts),
 * quindi il PDF resta valido anche per gli account creati in produzione.
 *
 * La pulizia (reset) tocca SOLO le famiglie tester (riconosciute dal nome marker)
 * a cui appartengono gli utenti tester: mai famiglie o dati reali. Tutto in transazione.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, entitlements } from "../../shared/schema";

export const TESTER_COUNT = 15;
export const TESTER_TRIAL_DAYS = 15;

// Abilitazione via env var (shared: dev + prod). Come l'account demo.
export const TESTER_ENABLED = process.env.ENABLE_TESTER_ACCOUNTS === "true";

// Dominio coerente con l'account demo (dominio verificato su Resend).
const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || "demo@familysync.eu";
const DOMAIN = DEMO_EMAIL.split("@")[1] || "familysync.eu";

// Marker deterministico: la pulizia cancella SOLO le famiglie con questo nome.
const TESTER_FAMILY_NAME = "Famiglia Tester";
const TESTER_PRODUCT_ID = "familysync_tester_trial";

// Secret da cui derivare le password (globale, identico dev/prod).
const PASSWORD_SEED = process.env.TESTER_PASSWORD_SEED || process.env.SESSION_SECRET || "";

// Alfabeto senza caratteri ambigui (niente 0/O/1/I/l) per password leggibili nel PDF.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TesterCredential {
  index: number;
  email: string;
  name: string;
  password: string;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Password deterministica per l'account i-esimo, derivata da SESSION_SECRET via
 * HMAC-SHA256. Formato leggibile: 4 gruppi di 4 caratteri (es. ABCD-EFGH-JKLM-NPQR).
 */
function derivePassword(index: number): string {
  const digest = crypto
    .createHmac("sha256", PASSWORD_SEED)
    .update(`familysync-tester-account-${index}`)
    .digest();
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[digest[i] % ALPHABET.length];
    if (i % 4 === 3 && i !== 15) out += "-";
  }
  return out;
}

/**
 * Elenco completo delle credenziali tester (derivate, senza toccare il DB).
 * Usato sia dal seeding sia dalla generazione del PDF.
 */
export function getTesterCredentials(): TesterCredential[] {
  const list: TesterCredential[] = [];
  for (let i = 1; i <= TESTER_COUNT; i++) {
    list.push({
      index: i,
      email: `tester${pad2(i)}@${DOMAIN}`,
      name: `Tester ${pad2(i)}`,
      password: derivePassword(i),
    });
  }
  return list;
}

async function cleanup(tx: Tx, emails: string[]): Promise<void> {
  const existing = await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  if (existing.length === 0) return;
  const userIds = existing.map((u) => u.id);

  // Solo le famiglie tester (nome marker) a cui appartengono gli utenti tester.
  const testerFamilies = await tx
    .selectDistinct({ familyId: families.id })
    .from(families)
    .innerJoin(familyMembers, eq(familyMembers.familyId, families.id))
    .where(and(eq(families.name, TESTER_FAMILY_NAME), inArray(familyMembers.userId, userIds)));

  const familyIds = testerFamilies.map((f) => f.familyId);
  if (familyIds.length > 0) {
    await tx.delete(families).where(inArray(families.id, familyIds));
  }
  await tx.delete(users).where(inArray(users.id, userIds));
}

async function createTester(tx: Tx, cred: TesterCredential, now: Date): Promise<void> {
  const passwordHash = await bcrypt.hash(cred.password, 10);

  const [user] = await tx
    .insert(users)
    .values({
      email: cred.email,
      passwordHash,
      name: cred.name,
      emailVerified: true, // tutte le /api richiedono email verificata
      termsAcceptedAt: now,
      aiFeaturesEnabled: true,
    })
    .returning();

  const [family] = await tx
    .insert(families)
    .values({
      name: TESTER_FAMILY_NAME,
      colorTheme: "#6366F1",
      subscriptionStatus: "free", // la prova non è ancora partita (pending)
    })
    .returning();

  await tx.insert(familyMembers).values({
    familyId: family.id,
    userId: user.id,
    role: "admin",
    nickname: cred.name,
    color: "#6366F1",
  });

  // Prova gratuita: entitlement "pending" con trialDays. Si attiva al primo login.
  await tx.insert(entitlements).values({
    familyId: family.id,
    userId: user.id,
    platform: "revenuecat",
    productId: TESTER_PRODUCT_ID,
    status: "pending",
    expiresAt: null,
    trialDays: TESTER_TRIAL_DAYS,
  });
}

export interface EnsureTesterResult {
  created: number;
  skipped: boolean;
  reason?: "disabled" | "missing_secret";
}

/**
 * Garantisce i 15 account tester.
 * - reset=false (boot): crea solo quelli mancanti (idempotente).
 * - reset=true (script CLI): rigenera tutti da zero (pulizia marker-scoped).
 * - force=true: ignora il flag ENABLE_TESTER_ACCOUNTS (usato dallo script).
 */
export async function ensureTesterAccounts(
  opts: { reset?: boolean; force?: boolean } = {},
): Promise<EnsureTesterResult> {
  if (!TESTER_ENABLED && !opts.force) {
    return { created: 0, skipped: true, reason: "disabled" };
  }
  if (!PASSWORD_SEED) {
    return { created: 0, skipped: true, reason: "missing_secret" };
  }

  const creds = getTesterCredentials();
  const emails = creds.map((c) => c.email);

  return db.transaction(async (tx): Promise<EnsureTesterResult> => {
    // Lock advisory transazionale: serializza chiamate concorrenti (deploy
    // multi-istanza / restart simultanei) evitando insert duplicati su email.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('familysync:tester-accounts'))`);

    if (opts.reset) {
      await cleanup(tx, emails);
    }

    const now = new Date();
    const present = await tx
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.email, emails));
    const existing = new Set(present.map((r) => r.email));

    let created = 0;
    for (const cred of creds) {
      if (existing.has(cred.email)) continue; // già presente: non tocchiamo nulla
      await createTester(tx, cred, now);
      created += 1;
    }

    return { created, skipped: false };
  });
}
