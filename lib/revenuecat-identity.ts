/**
 * MICRO-MANDATO SICUREZZA ATTRIBUZIONE ACQUISTI:
 * prima di QUALSIASI purchase/restore l'SDK RevenueCat deve essere
 * inizializzato e loggato sulla famiglia ATTUALMENTE selezionata
 * (AppUserID = familyId). Con denaro reale un acquisto non deve mai poter
 * finire attribuito alla famiglia precedentemente attiva.
 *
 * Logica pura con dipendenze iniettate (nessun import react-native), così è
 * testabile con node:test.
 */

export interface RevenueCatIdentityDeps {
  /** Inizializza l'SDK (idempotente). DEVE lanciare se la chiave manca. */
  initialize: () => void;
  /** Purchases.logIn: DEVE lanciare in caso di errore. */
  logIn: (appUserId: string) => Promise<unknown>;
  /** Purchases.getAppUserID: identità effettiva dopo il login. */
  getAppUserID: () => Promise<string>;
}

/**
 * LOCK GLOBALE per le operazioni che toccano l'identità RevenueCat.
 * L'SDK Purchases è un singleton di processo: un logIn lanciato dal cambio
 * famiglia (best-effort, non atteso) potrebbe altrimenti completarsi TRA la
 * verifica d'identità e purchasePackage/restorePurchases, attribuendo il
 * pagamento alla famiglia sbagliata. Tutte le operazioni identità+acquisto
 * passano da questa coda FIFO: mai interleaving.
 */
let identityChain: Promise<unknown> = Promise.resolve();

export function withRevenueCatIdentityLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = identityChain.then(fn, fn);
  // La catena non deve mai rompersi per l'errore di un'operazione precedente.
  identityChain = run.catch(() => {});
  return run;
}

/**
 * Garantisce che l'SDK sia inizializzato e loggato su `familyId`.
 * Lancia (bloccando il pagamento) se: familyId manca, l'inizializzazione
 * fallisce, il logIn fallisce, o l'identità risultante non corrisponde.
 */
export async function ensureRevenueCatIdentity(
  deps: RevenueCatIdentityDeps,
  familyId: string | null | undefined,
): Promise<string> {
  if (!familyId) {
    throw new Error("Nessuna famiglia selezionata: operazione di acquisto bloccata.");
  }
  // NIENTE try/catch silenziosi: gli errori di init/login devono propagare
  // al chiamante, che blocca il pagamento e mostra un messaggio.
  deps.initialize();
  await deps.logIn(familyId);
  const effective = await deps.getAppUserID();
  if (effective !== familyId) {
    throw new Error("Identità RevenueCat non corrispondente alla famiglia selezionata: operazione bloccata.");
  }
  return familyId;
}

/**
 * Esegue `action` (purchase o restore) SOLO dopo che l'identità RevenueCat è
 * confermata sulla famiglia corrente. Se l'identificazione fallisce, `action`
 * NON viene mai invocata. Verifica + azione girano DENTRO il lock globale:
 * nessun logIn concorrente (es. cambio famiglia) può inserirsi in mezzo.
 */
export async function runWithRevenueCatIdentity<T>(
  deps: RevenueCatIdentityDeps,
  familyId: string | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  return withRevenueCatIdentityLock(async () => {
    await ensureRevenueCatIdentity(deps, familyId);
    return action();
  });
}
