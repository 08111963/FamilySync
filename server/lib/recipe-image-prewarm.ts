import crypto from 'crypto';
import path from 'path';

/**
 * Prewarm foto ricette: logica pura, separata da server/routes/ai.ts per
 * poterla testare senza DB/OpenAI (dipendenze iniettate: filesystem e
 * avvio generazione). Vedi createRecipeImagePrewarm.
 */

/** Chiave di cache: hash del titolo normalizzato (accenti/maiuscole ignorati). */
export function recipeImageCacheKey(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export interface RecipeImagePrewarmItem {
  title: string;
  description?: string;
}

export interface StartGenerationParams {
  key: string;
  filePath: string;
  title: string;
  description?: string;
  userId: string;
  familyId: string;
}

export interface RecipeImagePrewarmDeps {
  /** Cartella su disco dove vivono le foto (.webp). */
  imagesDir: string;
  /** true se la foto è già in cache su disco (nessuna quota consumata). */
  fileExists: (filePath: string) => boolean;
  /**
   * Avvia (o si aggancia a) la generazione della foto: run risolve con
   * l'esito di withAiUsage ('ok' | 'limited' | 'unavailable').
   */
  startGeneration: (params: StartGenerationParams) => { run: Promise<{ outcome: string }> };
  /** Log di un errore AI su un singolo titolo (il prewarm continua). */
  logWarn: (message: string, meta: Record<string, unknown>) => void;
  /** Limite di concorrenza (default 2) per non saturare l'API immagini. */
  concurrency?: number;
}

/**
 * Crea la funzione di prewarm: dopo i suggerimenti/piano pasti, genera in
 * background le foto mancanti così l'utente le trova già in cache.
 * - I titoli già in cache su disco vengono saltati (zero quota).
 * - Si ferma subito su outcome 'limited' (quota famiglia esaurita) o
 *   'unavailable' (tracking quota KO): inutile insistere sugli altri titoli.
 * - Un errore AI su un titolo viene loggato e NON ferma gli altri.
 * La promise ritornata non rigetta mai (fire-and-forget sicuro), ma i test
 * possono attenderla per osservare l'esito.
 */
export function createRecipeImagePrewarm(deps: RecipeImagePrewarmDeps) {
  const concurrency = deps.concurrency ?? 2;

  return function prewarmRecipeImages(
    items: RecipeImagePrewarmItem[],
    userId: string,
    familyId: string,
  ): Promise<void> {
    // Solo titoli validi e non già in cache su disco.
    const pending = items
      .map(r => ({
        title: typeof r.title === 'string' ? r.title.trim() : '',
        description: typeof r.description === 'string' ? r.description.trim().slice(0, 300) : undefined,
      }))
      .filter(r => r.title.length >= 2 && r.title.length <= 200)
      .map(r => {
        const key = recipeImageCacheKey(r.title);
        return { ...r, key, filePath: path.join(deps.imagesDir, `${key}.webp`) };
      })
      .filter(r => !deps.fileExists(r.filePath));
    if (pending.length === 0) return Promise.resolve();

    let index = 0;
    let stopped = false;

    const worker = async () => {
      while (!stopped && index < pending.length) {
        const item = pending[index++];
        try {
          const { run } = deps.startGeneration({ ...item, userId, familyId });
          const result = await run;
          if (result.outcome === 'limited' || result.outcome === 'unavailable') {
            // Quota esaurita o tracking KO: inutile insistere sugli altri titoli.
            stopped = true;
          }
        } catch (error) {
          // Errore AI su un titolo: logga e continua con i successivi.
          deps.logWarn('Recipe image prewarm error', { error: String(error), familyId, title: item.title });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, pending.length) },
      () => worker(),
    );
    // Nessun unhandled rejection: i worker non rigettano, ma allSettled per sicurezza.
    return Promise.allSettled(workers).then(() => undefined);
  };
}
