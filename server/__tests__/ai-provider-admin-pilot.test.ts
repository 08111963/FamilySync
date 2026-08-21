import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAiProviderForUserRole,
  resolveOpenAiConfig,
} from "../lib/ai-errors";
import {
  __setOpenAiClientForTest,
  parseExpenseFromText,
} from "../lib/openai";

const original = {
  directKey: process.env.OPENAI_API_KEY,
  managedKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  managedBaseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
};

function restore(name: keyof typeof original, envName: string) {
  const value = original[name];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

afterEach(() => {
  __setOpenAiClientForTest(null, "openai_direct");
  __setOpenAiClientForTest(null, "replit_managed");
  restore("directKey", "OPENAI_API_KEY");
  restore("managedKey", "AI_INTEGRATIONS_OPENAI_API_KEY");
  restore("managedBaseUrl", "AI_INTEGRATIONS_OPENAI_BASE_URL");
});

describe("pilot provider AI per admin", () => {
  test("admin usa OpenAI diretto, utenti e job restano Replit", () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    assert.equal(resolveAiProviderForUserRole("admin"), "openai_direct");
    assert.equal(resolveAiProviderForUserRole("adult"), "replit_managed");
    assert.equal(resolveAiProviderForUserRole("child"), "replit_managed");
    assert.equal(resolveAiProviderForUserRole(undefined), "replit_managed");
  });

  test("senza chiave personale anche l'admin ricade sul provider Replit", () => {
    delete process.env.OPENAI_API_KEY;
    assert.equal(resolveAiProviderForUserRole("admin"), "replit_managed");
  });

  test("la configurazione diretta non eredita mai il baseURL Replit", () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://managed.example.test/v1";

    assert.deepEqual(resolveOpenAiConfig("openai_direct"), {
      apiKey: "direct-test-key",
      baseURL: undefined,
    });
    assert.deepEqual(resolveOpenAiConfig("replit_managed"), {
      apiKey: "managed-test-key",
      baseURL: "https://managed.example.test/v1",
    });
  });

  test("due richieste concorrenti mantengono client e provider separati", async () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    const calls: string[] = [];
    const fakeClient = (name: string) => ({
      chat: {
        completions: {
          create: async () => {
            calls.push(name);
            await Promise.resolve();
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    amount: 12,
                    category: "alimentari",
                    description: "Spesa test",
                  }),
                },
              }],
            };
          },
        },
      },
    });

    __setOpenAiClientForTest(fakeClient("direct"), "openai_direct");
    __setOpenAiClientForTest(fakeClient("managed"), "replit_managed");

    const [adminResult, userResult] = await Promise.all([
      parseExpenseFromText("12 euro di spesa", "openai_direct"),
      parseExpenseFromText("12 euro di spesa", "replit_managed"),
    ]);

    assert.equal(adminResult.amount, 12);
    assert.equal(userResult.category, "alimentari");
    assert.deepEqual(calls.sort(), ["direct", "managed"]);
  });
});