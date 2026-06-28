import { Router, type Request, type Response } from "express";
import { pool } from "../db";

// ---------------------------------------------------------------------------
// MIGRAZIONE DATI UNA TANTUM (dev -> produzione)
//
// Endpoint TEMPORANEO e protetto da token, usato solo per copiare i dati dal
// database di sviluppo a quello di produzione (che e' separato e altrimenti
// non scrivibile dall'esterno).
//
// Sicurezza:
//  - disabilitato (404) se la variabile MIGRATE_TOKEN non e' impostata;
//  - richiede l'header x-migrate-token uguale a MIGRATE_TOKEN;
//  - dopo la migrazione la variabile va eliminata per disattivarlo.
//
// Ordine di inserimento: genitori prima dei figli (vincoli FK). Tutte le PK
// sono UUID, quindi le righe vengono copiate cosi' come sono.
// ---------------------------------------------------------------------------

const INSERT_ORDER = [
  "users",
  "families",
  "family_members",
  "recipes",
  "meal_plans",
  "shopping_lists",
  "ai_insights",
  "ai_usage",
  "blocks",
  "chat_messages",
  "entitlements",
  "family_invites",
  "reports",
  "shopping_history",
  "push_tokens",
  "email_verification_tokens",
  "password_reset_tokens",
  "calendar_events",
  "chores",
  "bills",
  "recipe_ingredients",
  "meal_plan_items",
  "shopping_items",
  "bill_attachments",
  "bill_payment_history",
  "bill_splits",
];

const router = Router();

router.post("/import", async (req: Request, res: Response) => {
  const token = process.env.MIGRATE_TOKEN;
  if (!token) {
    return res.status(404).json({ error: { code: "NOT_FOUND" } });
  }
  if (req.header("x-migrate-token") !== token) {
    return res.status(403).json({ error: { code: "FORBIDDEN" } });
  }

  const tables = (req.body && req.body.tables) as
    | Record<string, Array<Record<string, unknown>>>
    | undefined;
  if (!tables || typeof tables !== "object") {
    return res.status(400).json({ error: { code: "MISSING_TABLES" } });
  }

  const counts: Record<string, number> = {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const truncateList = INSERT_ORDER.map((t) => `"${t}"`).join(", ");
    await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

    for (const table of INSERT_ORDER) {
      const rows = tables[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        counts[table] = 0;
        continue;
      }

      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const CHUNK = 200;
      let inserted = 0;

      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const groups: string[] = [];
        let p = 1;
        for (const row of slice) {
          const placeholders: string[] = [];
          for (const c of cols) {
            let v = (row as Record<string, unknown>)[c];
            // jsonb: ri-serializza gli oggetti (null e' escluso dal check)
            if (v !== null && typeof v === "object") {
              v = JSON.stringify(v);
            }
            params.push(v);
            placeholders.push(`$${p++}`);
          }
          groups.push(`(${placeholders.join(", ")})`);
        }
        await client.query(
          `INSERT INTO "${table}" (${colList}) VALUES ${groups.join(", ")}`,
          params,
        );
        inserted += slice.length;
      }

      counts[table] = inserted;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    client.release();
    return res
      .status(500)
      .json({ error: { code: "IMPORT_FAILED", message: String((error as Error)?.message ?? error) } });
  }

  client.release();
  return res.json({ ok: true, counts });
});

export default router;
