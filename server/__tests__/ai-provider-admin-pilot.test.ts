import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isOpenAiDirectPilotUser,
  resolveAiProviderForUserId,
  resolveOpenAiConfig,
} from "../lib/ai-errors";
import {
  __setOpenAiClientForTest,
  parseExpenseFromText,
} from "../lib/openai";

const original = {
  directKey: process.env.OPENAI_API_KEY,
  pilotUserIds: process.env.OPENAI_DIRECT_PILOT_USER_IDS,
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
  restore("pilotUserIds", "OPENAI_DIRECT_PILOT_USER_IDS");
  restore("managedKey", "AI_INTEGRATIONS_OPENAI_API_KEY");
  restore("managedBaseUrl", "AI_INTEGRATIONS_OPENAI_BASE_URL");
});

describe("pilot provider AI per allowlist utente", () => {
  test("un user ID nella allowlist usa OpenAI diretto con chiave configurata", () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    process.env.OPENAI_DIRECT_PILOT_USER_IDS = "pilot-user-id";

    assert.equal(isOpenAiDirectPilotUser("pilot-user-id"), true);
    assert.equal(resolveAiProviderForUserId("pilot-user-id"), "openai_direct");
  });

  test("un family admin non in allowlist resta su Replit Managed AI", () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    process.env.OPENAI_DIRECT_PILOT_USER_IDS = "pilot-user-id";

    assert.equal(resolveAiProviderForUserId("family-admin-not-in-pilot"), "replit_managed");
  });

  test("un adult non in allowlist resta su Replit Managed AI", () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    process.env.OPENAI_DIRECT_PILOT_USER_IDS = "pilot-user-id";

    assert.equal(resolveAiProviderForUserId("adult-not-in-pilot"), "replit_managed");
  });

  test("un utente in allowlist senza chiave diretta ricade su Replit", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_DIRECT_PILOT_USER_IDS = "pilot-user-id";

    assert.equal(resolveAiProviderForUserId("pilot-user-id"), "replit_managed");
  });

  test("una allowlist assente o vuota mantiene tutti su Replit", () => {
    process.env.OPENAI_API_KEY = "direct-test-key";
    delete process.env.OPENAI_DIRECT_PILOT_USER_IDS;
    assert.equal(resolveAiProviderForUserId("any-user-id"), "replit_managed");

    process.env.OPENAI_DIRECT_PILOT_USER_IDS = " , ";
    assert.equal(resolveAiProviderForUserId("any-user-id"), "replit_managed");
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
    process.env.OPENAI_DIRECT_PILOT_USER_IDS = "pilot-user-id";
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

    const [pilotResult, familyAdminResult] = await Promise.all([
      parseExpenseFromText("12 euro di spesa", "openai_direct"),
      parseExpenseFromText("12 euro di spesa", "replit_managed"),
    ]);

    assert.equal(resolveAiProviderForUserId("pilot-user-id"), "openai_direct");
    assert.equal(resolveAiProviderForUserId("family-admin-not-in-pilot"), "replit_managed");
    assert.equal(pilotResult.amount, 12);
    assert.equal(familyAdminResult.category, "alimentari");
    assert.deepEqual(calls.sort(), ["direct", "managed"]);
  });
});