/**
 * Test unitari per l'alert automatico sui CLIENT_CRASH ripetuti.
 * Run: npx tsx server/__tests__/client-crash-alert.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

// Niente APP_OWNER_EMAILS: l'email diventa un no-op loggato, ma il valore
// di ritorno di recordClientCrash indica comunque quando l'alert scatta.
delete process.env.APP_OWNER_EMAILS;
process.env.CLIENT_CRASH_ALERT_THRESHOLD = "3";
process.env.CLIENT_CRASH_ALERT_WINDOW_MINUTES = "15";
process.env.CLIENT_CRASH_ALERT_COOLDOWN_MINUTES = "60";

import {
  recordClientCrash,
  resetClientCrashAlertState,
  sanitizeCrashSample,
} from "../lib/client-crash-alert";

const MIN = 60 * 1000;
const sample = { message: "routes.findLast is not a function", url: "/join" };

test("non scatta sotto soglia", () => {
  resetClientCrashAlertState();
  const t0 = 1_000_000_000_000;
  assert.equal(recordClientCrash(sample, t0), false);
  assert.equal(recordClientCrash(sample, t0 + MIN), false);
});

test("scatta al raggiungimento della soglia nella finestra", () => {
  resetClientCrashAlertState();
  const t0 = 1_000_000_000_000;
  recordClientCrash(sample, t0);
  recordClientCrash(sample, t0 + MIN);
  assert.equal(recordClientCrash(sample, t0 + 2 * MIN), true);
});

test("cooldown: nessun secondo alert subito dopo", () => {
  resetClientCrashAlertState();
  const t0 = 1_000_000_000_000;
  recordClientCrash(sample, t0);
  recordClientCrash(sample, t0 + MIN);
  assert.equal(recordClientCrash(sample, t0 + 2 * MIN), true);
  assert.equal(recordClientCrash(sample, t0 + 3 * MIN), false);
  // Dopo il cooldown (60 min) e con abbastanza crash in finestra, riscatta.
  const t1 = t0 + 70 * MIN;
  recordClientCrash(sample, t1);
  recordClientCrash(sample, t1 + MIN);
  assert.equal(recordClientCrash(sample, t1 + 2 * MIN), true);
});

test("crash fuori finestra non contano", () => {
  resetClientCrashAlertState();
  const t0 = 1_000_000_000_000;
  recordClientCrash(sample, t0);
  recordClientCrash(sample, t0 + MIN);
  // Il terzo arriva 20 minuti dopo: i primi due sono usciti dalla finestra.
  assert.equal(recordClientCrash(sample, t0 + 22 * MIN), false);
});

test("sanitizzazione: query/fragment con token spariscono dall'URL", () => {
  const s = sanitizeCrashSample({
    message: "boom",
    url: "https://familysync.eu/reset-password?token=abc123secretsecretsecretsecretsecretsecret#access_token=xyz",
  });
  assert.equal(s.url, "https://familysync.eu/reset-password");
  assert.ok(!JSON.stringify(s).includes("abc123"));
  assert.ok(!JSON.stringify(s).includes("xyz"));
});

test("sanitizzazione: URL relativo malformato perde query e fragment", () => {
  const s = sanitizeCrashSample({
    message: "boom",
    url: "/oauth/callback?code=4/0AbCdEf&state=s#frag",
  });
  assert.equal(s.url, "/oauth/callback");
});

test("sanitizzazione: token, password ed email non finiscono nel contenuto", () => {
  const s = sanitizeCrashSample({
    message:
      'fetch failed for user mario.rossi@example.com with "password":"SuperSegreta1" and code=4/0AbCdEfGhIjKl token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlc2lnbmF0dXJl',
    userAgent: "Mozilla/5.0 access_token=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  });
  const flat = JSON.stringify(s);
  assert.ok(!flat.includes("mario.rossi@"));
  assert.ok(!flat.includes("SuperSegreta1"));
  assert.ok(!flat.includes("4/0AbCdEfGhIjKl"));
  assert.ok(!flat.includes("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0"));
  assert.ok(!flat.includes("deadbeefdeadbeef"));
});

test("sanitizzazione: token nel PATH delle route sensibili mascherati", () => {
  const cases = [
    ["https://familysync.eu/reset-password/tok123abc", "https://familysync.eu/reset-password/[REDACTED]"],
    ["https://familysync.eu/verify-email/tok123abc", "https://familysync.eu/verify-email/[REDACTED]"],
    ["https://familysync.eu/join/tok123abc", "https://familysync.eu/join/[REDACTED]"],
    ["https://familysync.eu/join-link/tok123abc/extra", "https://familysync.eu/join-link/[REDACTED]/[REDACTED]"],
    ["/reset-password/tok123abc?x=1", "/reset-password/[REDACTED]"],
  ] as const;
  for (const [input, expected] of cases) {
    const s = sanitizeCrashSample({ message: "boom", url: input });
    assert.equal(s.url, expected, input);
    assert.ok(!JSON.stringify(s).includes("tok123abc"), input);
  }
});

test("threshold 0 disattiva l'alert", () => {
  resetClientCrashAlertState();
  process.env.CLIENT_CRASH_ALERT_THRESHOLD = "0";
  const t0 = 1_000_000_000_000;
  for (let i = 0; i < 10; i++) {
    assert.equal(recordClientCrash(sample, t0 + i * 1000), false);
  }
  process.env.CLIENT_CRASH_ALERT_THRESHOLD = "3";
});
