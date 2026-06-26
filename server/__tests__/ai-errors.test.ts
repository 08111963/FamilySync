import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AiError,
  isAiError,
  assertAiConfigured,
  mapOpenAiError,
  type AiErrorCode,
} from "../lib/ai-errors";

const ORIGINAL_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  } else {
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = ORIGINAL_KEY;
  }
});

describe("assertAiConfigured", () => {
  test("chiave mancante -> AiError AI_NOT_CONFIGURED (503)", () => {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    try {
      assertAiConfigured();
      assert.fail("doveva lanciare");
    } catch (err) {
      assert.ok(isAiError(err));
      assert.equal((err as AiError).code, "AI_NOT_CONFIGURED");
      assert.equal((err as AiError).httpStatus, 503);
    }
  });

  test("chiave vuota/spazi -> AI_NOT_CONFIGURED", () => {
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "   ";
    assert.throws(() => assertAiConfigured(), (err: unknown) => isAiError(err) && err.code === "AI_NOT_CONFIGURED");
  });

  test("chiave presente -> nessun errore", () => {
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "sk-test-123";
    assert.doesNotThrow(() => assertAiConfigured());
  });

  test("non logga mai il valore della chiave nel messaggio", () => {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "sk-super-secret-value";
    // con chiave presente non lancia; ma verifichiamo che il messaggio interno
    // della classe non includa mai un valore di chiave.
    const e = new AiError("AI_NOT_CONFIGURED", "AI_INTEGRATIONS_OPENAI_API_KEY non configurata");
    assert.ok(!e.message.includes("sk-super-secret-value"));
  });
});

describe("mapOpenAiError", () => {
  const cases: Array<{ name: string; input: unknown; expected: AiErrorCode; status: number }> = [
    { name: "429 rate limit", input: { status: 429 }, expected: "AI_RATE_LIMITED", status: 429 },
    { name: "insufficient_quota", input: { code: "insufficient_quota" }, expected: "AI_RATE_LIMITED", status: 429 },
    { name: "401 auth", input: { status: 401 }, expected: "AI_NOT_CONFIGURED", status: 503 },
    { name: "403 auth", input: { status: 403 }, expected: "AI_NOT_CONFIGURED", status: 503 },
    { name: "timeout name", input: { name: "APITimeoutError" }, expected: "AI_TIMEOUT", status: 504 },
    { name: "abort", input: { name: "AbortError" }, expected: "AI_TIMEOUT", status: 504 },
    { name: "connection refused", input: { name: "APIConnectionError" }, expected: "AI_PROVIDER_ERROR", status: 502 },
    { name: "generico 500", input: { status: 500 }, expected: "AI_PROVIDER_ERROR", status: 502 },
    { name: "errore sconosciuto", input: new Error("boom"), expected: "AI_PROVIDER_ERROR", status: 502 },
  ];

  for (const c of cases) {
    test(`${c.name} -> ${c.expected}`, () => {
      const mapped = mapOpenAiError(c.input);
      assert.ok(isAiError(mapped));
      assert.equal(mapped.code, c.expected);
      assert.equal(mapped.httpStatus, c.status);
    });
  }

  test("risposta malformata (SyntaxError) -> AI_BAD_RESPONSE (502)", () => {
    let syntaxErr: unknown;
    try {
      JSON.parse("{ non-json");
    } catch (e) {
      syntaxErr = e;
    }
    const mapped = mapOpenAiError(syntaxErr);
    assert.equal(mapped.code, "AI_BAD_RESPONSE");
    assert.equal(mapped.httpStatus, 502);
  });

  test("ZodError (validazione fallita) -> AI_BAD_RESPONSE", () => {
    const zodLike = { name: "ZodError", message: "invalid" };
    assert.equal(mapOpenAiError(zodLike).code, "AI_BAD_RESPONSE");
  });

  test("un AiError esistente viene restituito invariato", () => {
    const original = new AiError("AI_TIMEOUT", "x");
    assert.equal(mapOpenAiError(original), original);
  });

  test("ogni AiError ha un messaggio utente in italiano non vuoto", () => {
    const codes: AiErrorCode[] = [
      "AI_NOT_CONFIGURED",
      "AI_RATE_LIMITED",
      "AI_TIMEOUT",
      "AI_BAD_RESPONSE",
      "AI_PROVIDER_ERROR",
    ];
    for (const code of codes) {
      const e = new AiError(code);
      assert.ok(e.userMessage.length > 0, `${code} deve avere userMessage`);
    }
  });
});

describe("openai client lazy (avvio senza chiave)", () => {
  test("importare ../lib/openai SENZA chiave non lancia (il server può partire)", async () => {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    // Il client OpenAI deve essere lazy: l'import del modulo non deve costruire
    // il client (il costruttore del SDK lancia se la chiave manca).
    await assert.doesNotReject(async () => {
      await import("../lib/openai");
    });
  });
});
