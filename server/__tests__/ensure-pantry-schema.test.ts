import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { eq, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { families, pantryItems } from "../../shared/schema";
import { ensurePantryUniqueIndex } from "../lib/ensure-pantry-schema";

/**
 * Test di INTEGRAZIONE contro il DB reale: verifica che ensurePantryUniqueIndex
 * ripari da solo l'indice univoco della dispensa mancante:
 * - droppa l'indice, semina doppioni, chiama la funzione
 * - i doppioni vengono uniti (somma quantità, scadenza più vicina, come 0010)
 * - l'indice viene ricreato
 * - una seconda chiamata è no-op (created: false)
 * Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

const INDEX_NAME = "pantry_items_family_norm_unit_uq";

async function indexExists(): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'pantry_items' AND indexname = ${INDEX_NAME}
  `);
  return ((res as any).rows?.length ?? 0) > 0;
}

describe("ensurePantryUniqueIndex ripara l'indice dispensa (DB)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let familyId: string;

  before(async () => {
    const [f] = await db.insert(families).values({ name: "Pantry Index Test Family" }).returning({ id: families.id });
    familyId = f!.id;
  });

  after(async () => {
    // Ripristina sempre l'indice, anche se un assert fallisce a metà.
    await ensurePantryUniqueIndex();
    if (familyId) await db.delete(families).where(eq(families.id, familyId));
  });

  test("dedup doppioni + ricrea indice + seconda chiamata no-op", async () => {
    // 1) Droppa l'indice per simulare il Republish che non lo sincronizza.
    await db.execute(sql`DROP INDEX IF EXISTS "pantry_items_family_norm_unit_uq"`);
    assert.equal(await indexExists(), false, "indice dovrebbe essere assente dopo il DROP");

    // 2) Semina doppioni sulla stessa chiave (family, normalized_name, COALESCE(unit,'')).
    const base = Date.now();
    // Gruppo A: "latte" senza unit — 3 righe, quantità 1 + 2 + NULL, scadenze diverse.
    await db.insert(pantryItems).values([
      {
        familyId, name: "Latte", normalizedName: "latte",
        quantity: "1", unit: null, expiryDate: "2026-09-10",
        createdAt: new Date(base - 3000), updatedAt: new Date(base - 3000),
      },
      {
        familyId, name: "latte", normalizedName: "latte",
        quantity: "2", unit: null, expiryDate: "2026-08-20",
        createdAt: new Date(base - 2000), updatedAt: new Date(base - 2000),
      },
      {
        familyId, name: "LATTE", normalizedName: "latte",
        quantity: null, unit: null, expiryDate: null,
        createdAt: new Date(base - 1000), updatedAt: new Date(base - 1000),
      },
      // Gruppo B: "farina" con unit "g" — 2 righe entrambe quantity NULL.
      {
        familyId, name: "Farina", normalizedName: "farina",
        quantity: null, unit: "g", expiryDate: null,
        createdAt: new Date(base - 3000), updatedAt: new Date(base - 3000),
      },
      {
        familyId, name: "Farina 00", normalizedName: "farina",
        quantity: null, unit: "g", expiryDate: "2026-12-01",
        createdAt: new Date(base - 2000), updatedAt: new Date(base - 2000),
      },
      // Gruppo C: "farina" SENZA unit — chiave diversa da B, non va unita con B.
      {
        familyId, name: "Farina generica", normalizedName: "farina",
        quantity: "5", unit: null, expiryDate: null,
        createdAt: new Date(base - 1000), updatedAt: new Date(base - 1000),
      },
    ]);

    // 3) Chiama la riparazione.
    const first = await ensurePantryUniqueIndex();
    assert.equal(first.created, true, "prima chiamata deve creare l'indice");
    assert.equal(await indexExists(), true, "indice deve esistere dopo la riparazione");

    // 4) Verifica dedup.
    const rows = await db
      .select()
      .from(pantryItems)
      .where(eq(pantryItems.familyId, familyId))
      .orderBy(asc(pantryItems.createdAt));

    const latte = rows.filter((r) => r.normalizedName === "latte");
    assert.equal(latte.length, 1, "i 3 'latte' devono diventare 1");
    // Somma quantità: 1 + 2 + COALESCE(NULL,0) = 3 (non tutte NULL).
    assert.equal(Number(latte[0]!.quantity), 3);
    // Scadenza più vicina.
    assert.equal(latte[0]!.expiryDate, "2026-08-20");
    // Sopravvive la riga più vecchia (nome originale "Latte").
    assert.equal(latte[0]!.name, "Latte");

    const farinaG = rows.filter((r) => r.normalizedName === "farina" && r.unit === "g");
    assert.equal(farinaG.length, 1, "le 2 'farina g' devono diventare 1");
    // Tutte le quantità erano NULL -> resta NULL (bool_and), non 0.
    assert.equal(farinaG[0]!.quantity, null);
    assert.equal(farinaG[0]!.expiryDate, "2026-12-01");

    const farinaNoUnit = rows.filter((r) => r.normalizedName === "farina" && r.unit === null);
    assert.equal(farinaNoUnit.length, 1, "la 'farina' senza unit è chiave diversa e resta intatta");
    assert.equal(Number(farinaNoUnit[0]!.quantity), 5);

    assert.equal(rows.length, 3, "in totale devono restare 3 righe");

    // 5) L'indice funziona davvero: un secondo inserimento con la stessa chiave
    //    deve violare l'univocità.
    await assert.rejects(
      db.insert(pantryItems).values({
        familyId, name: "Latte bis", normalizedName: "latte", quantity: "1", unit: null,
      }),
      (err: any) => err?.code === "23505" || /duplicate key/i.test(String(err?.message)),
      "insert duplicato deve fallire con violazione univocità",
    );

    // 6) Seconda chiamata: no-op.
    const second = await ensurePantryUniqueIndex();
    assert.equal(second.created, false, "seconda chiamata deve essere no-op");
    assert.equal(await indexExists(), true);
  });
});

/**
 * Test di AVVIO: verifica che il boot del backend (server/index.ts) invochi
 * davvero la riparazione — se il wiring in index.ts sparisce, questo test
 * fallisce anche se l'helper di per sé funziona.
 */
describe("l'avvio del server ripara l'indice dispensa mancante (boot reale)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let child: ChildProcess | undefined;

  function killServerTree() {
    if (!child?.pid) return;
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* già morto */ }
  }

  after(async () => {
    killServerTree();
    // Rete di sicurezza: mai lasciare il DB senza indice.
    await ensurePantryUniqueIndex();
  });

  test("boot con indice mancante -> indice ricreato durante l'avvio", async () => {
    await db.execute(sql`DROP INDEX IF EXISTS "pantry_items_family_norm_unit_uq"`);
    assert.equal(await indexExists(), false, "indice assente prima del boot");

    const root = path.resolve(__dirname, "..", "..");
    // detached: il server è un albero di processi (tsx -> node); per fermarlo
    // davvero va ucciso l'intero process group, altrimenti il nipote orfano
    // tiene aperte le pipe e il test runner non termina mai.
    child = spawn("npx", ["tsx", "server/index.ts"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "0", // porta effimera: non collide con il server di sviluppo
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let output = "";
    child.stdout?.on("data", (d) => { output += String(d); });
    child.stderr?.on("data", (d) => { output += String(d); });
    const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));

    // Attende che il boot ricrei l'indice (fail-fast se il processo muore).
    const deadline = Date.now() + 90_000;
    let repaired = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      if (await indexExists()) { repaired = true; break; }
      await new Promise((r) => setTimeout(r, 500));
    }

    assert.equal(
      repaired,
      true,
      `il boot doveva ricreare l'indice; exitCode=${child.exitCode}, output:\n${output.slice(-2000)}`,
    );
    assert.match(output, /pantry unique index created \(was missing\)/, "il boot deve loggare la riparazione");

    // Prova end-to-end che l'upsert ON CONFLICT ora funziona: due upsert sulla
    // stessa chiave devono risolversi in UNA riga con quantità sommata.
    const [f] = await db.insert(families).values({ name: "Pantry Boot Test Family" }).returning({ id: families.id });
    try {
      for (const qty of ["1", "2"]) {
        await db.execute(sql`
          INSERT INTO pantry_items (family_id, name, normalized_name, quantity)
          VALUES (${f!.id}, 'Pane', 'pane', ${qty})
          ON CONFLICT (family_id, normalized_name, COALESCE(unit, ''))
          DO UPDATE SET quantity = COALESCE(pantry_items.quantity, 0) + EXCLUDED.quantity
        `);
      }
      const rows = await db.select().from(pantryItems).where(eq(pantryItems.familyId, f!.id));
      assert.equal(rows.length, 1, "upsert ON CONFLICT deve unire in una riga");
      assert.equal(Number(rows[0]!.quantity), 3);
    } finally {
      await db.delete(families).where(eq(families.id, f!.id));
    }

    killServerTree();
    await exited;
  });
});
