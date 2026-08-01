/**
 * Setup ambiente per i test che richiedono lo storage su bucket.
 * Va importato PRIMA di ogni altro modulo del server: con gli import ESM
 * (hoisted) l'unico modo affidabile per impostare env letti al load
 * (STORAGE_MODE in upload-storage, SESSION_SECRET in jwt) e' un modulo
 * side-effect importato per primo.
 */
process.env.STORAGE_MODE = "object-storage";
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
// Le rotte AI richiedono la chiave configurata anche sul percorso cache-hit
// (assertAiConfigured a monte); un valore fittizio basta perche' i cache-hit
// non chiamano mai OpenAI.
if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-openai-key";
}

export {};
