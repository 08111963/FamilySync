import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Notifiche bollette montate GLOBALMENTE (non solo nella tab)", () => {
  test("_layout.tsx monta BillNotificationsSyncProvider", () => {
    const layout = read("app/_layout.tsx");
    assert.match(layout, /import\s*\{\s*BillNotificationsSyncProvider\s*\}/);
    assert.match(layout, /<BillNotificationsSyncProvider>/);
  });

  test("il provider globale chiama useBillLocalNotifications e carica le bollette", () => {
    const provider = read("context/BillNotificationsProvider.tsx");
    assert.match(provider, /useBillLocalNotifications\s*\(/);
    assert.match(provider, /useFamily\s*\(/);
    assert.match(provider, /\/api\/bills\//);
  });

  test("la tab Bollette NON chiama più direttamente useBillLocalNotifications", () => {
    const bills = read("app/(tabs)/bills.tsx");
    assert.doesNotMatch(bills, /useBillLocalNotifications\s*\(/);
    // ma legge lo stato del permesso dal provider globale
    assert.match(bills, /useBillNotificationsStatus\s*\(/);
  });
});

describe("Query frontend bollette usano endpoint espliciti", () => {
  const files = ["app/(tabs)/bills.tsx", "app/add-bill.tsx", "app/bill/[id].tsx"];

  for (const f of files) {
    test(`${f}: nessuna queryKey in forma ["/api/bills", familyId, ...]`, () => {
      const src = read(f);
      // La vecchia forma con array multi-elemento non deve più comparire.
      assert.doesNotMatch(src, /\[\s*["'`]\/api\/bills["'`]\s*,/);
    });

    test(`${f}: usa URL espliciti /api/bills/\${familyId}...`, () => {
      const src = read(f);
      assert.match(src, /\/api\/bills\/\$\{familyId\}/);
    });
  }
});
