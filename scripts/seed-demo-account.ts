/**
 * Seed manuale dell'ACCOUNT DEMO per i revisori di App Store / Google Play.
 *
 * Rigenera da zero l'account demo (modalita reset) sul database puntato da
 * DATABASE_URL. La logica vive in server/lib/demo-account.ts ed e la stessa
 * usata all'avvio del server (che pero crea solo se manca).
 *
 * Richiede le variabili ambiente:
 *   ENABLE_DEMO_ACCOUNT=true
 *   DEMO_ACCOUNT_EMAIL=demo@familysync.eu   (opzionale, ha un default)
 *   DEMO_ACCOUNT_PASSWORD=...               (secret, obbligatorio)
 *
 * Avvio:  npx tsx scripts/seed-demo-account.ts
 */
import { ensureDemoAccount, DEMO_EMAIL } from "../server/lib/demo-account";

ensureDemoAccount({ reset: true })
  .then((r) => {
    if (r.skipped) {
      console.log("\nSeed demo SALTATO.");
      if (r.reason === "disabled") {
        console.log("Motivo: ENABLE_DEMO_ACCOUNT non e impostato a 'true'.");
      } else if (r.reason === "missing_password") {
        console.log("Motivo: il secret DEMO_ACCOUNT_PASSWORD non e impostato.");
      }
      console.log("Imposta le variabili ambiente e riprova.\n");
      process.exit(0);
    }
    console.log("\n========================================");
    console.log("  ACCOUNT DEMO PER I REVISORI - PRONTO");
    console.log("========================================");
    console.log(`  Email:    ${DEMO_EMAIL}`);
    console.log(`  Password: (nel secret DEMO_ACCOUNT_PASSWORD)`);
    console.log("----------------------------------------");
    console.log("  Email verificata: SI");
    console.log("  Premium: ATTIVO (tutte le funzioni)");
    console.log("  Dati di esempio: calendario, spesa, faccende,");
    console.log("  ricette, piano pasti, bollette, chat, AI.");
    console.log("========================================\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Errore durante il seed dell'account demo:", err);
    process.exit(1);
  });
