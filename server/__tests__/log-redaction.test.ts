import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import * as path from "path";
import { redactForLog } from "../lib/logger";

describe("redactForLog", () => {
  test("email: maschera la parte locale ma conserva prima lettera e dominio", () => {
    const out = redactForLog("login di mario.rossi@example.com riuscito");
    assert.ok(!out.includes("mario.rossi@"), out);
    assert.ok(out.includes("m***@example.com"), out);
  });

  test("JWT redatto interamente", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c";
    const out = redactForLog(`Authorization fallita: ${jwt}`);
    assert.ok(!out.includes(jwt), out);
    assert.ok(out.includes("[REDACTED_JWT]"), out);
  });

  test("Bearer auth header redatto", () => {
    const out = redactForLog("header: Bearer sk_live_abcdefghijklmnop");
    assert.ok(!out.includes("sk_live_abcdefghijklmnop"), out);
    assert.match(out, /Bearer \[REDACTED\]/i);
  });

  test("Basic auth header redatto", () => {
    const out = redactForLog("Authorization: Basic dXNlcjpwYXNzd29yZDEyMw==");
    assert.ok(!out.includes("dXNlcjpwYXNzd29yZDEyMw=="), out);
    assert.match(out, /Basic \[REDACTED\]/i);
  });

  test("token hex 64 redatto", () => {
    const hex = "a".repeat(64);
    const out = redactForLog(`reset token=${hex} generato`);
    assert.ok(!out.includes(hex), out);
    assert.ok(out.includes("[REDACTED"), out);
  });

  test("access_token in JSON redatto conservando la chiave", () => {
    const out = redactForLog('{"access_token":"segretissimo-123","user":"x"}');
    assert.ok(!out.includes("segretissimo-123"), out);
    assert.ok(out.includes('"access_token":"[REDACTED]"'), out);
  });

  test("access_token e code in URL/form redatti", () => {
    const out = redactForLog(
      "GET /cb?access_token=tok_abc123&code=4/0AbCdEf&state=ok e body refresh_token=rt_xyz",
    );
    assert.ok(!out.includes("tok_abc123"), out);
    assert.ok(!out.includes("4/0AbCdEf"), out);
    assert.ok(!out.includes("rt_xyz"), out);
    assert.ok(out.includes("state=ok"), out);
  });

  test("body simil-OAuth (Google token exchange) completamente redatto", () => {
    const body =
      '{"access_token":"ya29.a0AfH6SMBxyzXYZ","expires_in":3599,"refresh_token":"1//0gabcdefghijklmnopqrstuvwxyz1234567890ABCDEFG","id_token":"eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.c2lnbmF0dXJlZmFrZQ"}';
    const out = redactForLog(body);
    assert.ok(!out.includes("ya29.a0AfH6SMBxyzXYZ"), out);
    assert.ok(!out.includes("1//0gabcdefghijklmnopqrstuvwxyz"), out);
    assert.ok(!out.includes("eyJhbGciOiJSUzI1NiJ9"), out);
    assert.ok(out.includes('"expires_in":3599'), out);
  });

  test("body simil-webhook RevenueCat: email e token redatti, resto intatto", () => {
    const body = JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: "user_42",
        subscriber_attributes: { $email: { value: "premium.user@example.com" } },
      },
      api_version: "1.0",
      authorization: "Bearer f00dbabef00dbabef00dbabef00dbabef00dbabef00dbabe",
    });
    const out = redactForLog(body);
    assert.ok(!out.includes("premium.user@example.com"), out);
    assert.ok(!out.includes("f00dbabef00dbabe"), out);
    assert.ok(out.includes("INITIAL_PURCHASE"), out);
    assert.ok(out.includes("p***@example.com"), out);
  });

  test("stringa lunghissima senza '@': troncata e tempo limitato", () => {
    const huge = "x".repeat(2_000_000);
    const start = Date.now();
    const out = redactForLog(huge);
    const elapsed = Date.now() - start;
    assert.ok(out.length < 10_000, `output non troncato: ${out.length}`);
    assert.ok(out.endsWith("…[TRONCATO]"), out.slice(-30));
    assert.ok(elapsed < 2000, `troppo lento: ${elapsed}ms`);
  });

  test("stringa senza dati sensibili resta invariata", () => {
    const s = "avvio server sulla porta 5000, ambiente ok";
    assert.equal(redactForLog(s), s);
  });
});

// --- Test end-to-end del patch di console.* ---
// Il patch avviene all'import di server/lib/logger in base a NODE_ENV, quindi
// va verificato in un processo figlio con l'ambiente giusto.
const FIXTURE = path.join(__dirname, "helpers", "log-redaction-fixture.ts");

function runFixture(nodeEnv: "production" | "development"): { stdout: string; stderr: string } {
  const res = spawnSync("npx", ["tsx", FIXTURE], {
    env: { ...process.env, NODE_ENV: nodeEnv },
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(res.status, 0, `fixture uscita con ${res.status}: ${res.stderr}`);
  return { stdout: res.stdout, stderr: res.stderr };
}

describe("console.* patch (processo figlio)", () => {
  test("NODE_ENV=production: stdout+stderr redatti (email, JWT, circolari, BigInt, URL)", () => {
    const { stdout, stderr } = runFixtureProd();
    const all = stdout + "\n" + stderr;
    // email
    assert.ok(!all.includes("mario.rossi@example.com"), all);
    assert.ok(all.includes("m***@example.com"), all);
    // JWT
    assert.ok(!all.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), all);
    assert.ok(all.includes("[REDACTED_JWT]"), all);
    // oggetto circolare: non crasha, token hex redatto, email redatta
    assert.ok(!all.includes("anna.bianchi@example.it"), all);
    assert.ok(!all.includes("abcdef0123456789abcdef0123456789"), all);
    assert.ok(all.includes("[Circular"), all);
    // BigInt: non crasha, password redatta
    assert.ok(all.includes("123456789012345678901234567890"), all);
    assert.ok(!all.includes("hunter2segretissima"), all);
    // valore con apostrofo (inspect usa i doppi apici)
    assert.ok(!all.includes("apostrofo-mi-bypassava"), all);
    // chiave quotata / valore in backtick
    assert.ok(!all.includes("chiave-super-segreta"), all);
    assert.ok(!all.includes("nascondendo"), all);
    // Error stack con token hex
    assert.ok(!all.includes("deadbeefdeadbeef"), all);
    // URL con access_token
    assert.ok(!all.includes("sk_live_TOKENSEGRETO123"), all);
    assert.ok(all.includes("state=ok"), all);
  });

  test("NODE_ENV=development: output NON alterato", () => {
    const { stdout, stderr } = runFixture("development");
    const all = stdout + "\n" + stderr;
    assert.ok(all.includes("mario.rossi@example.com"), all);
    assert.ok(all.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), all);
    assert.ok(all.includes("hunter2segretissima"), all);
    assert.ok(all.includes("apostrofo-mi-bypassava"), all);
    assert.ok(all.includes("chiave-super-segreta"), all);
    assert.ok(all.includes("sk_live_TOKENSEGRETO123"), all);
    assert.ok(!all.includes("[REDACTED"), all);
  });
});

let prodResult: { stdout: string; stderr: string } | undefined;
function runFixtureProd() {
  if (!prodResult) prodResult = runFixture("production");
  return prodResult;
}
