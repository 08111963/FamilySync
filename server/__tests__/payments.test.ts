import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  validatePlan,
  PLAN_TO_INTERVAL,
  mapStripeStatusToFamily,
  buildCheckoutSessionParams,
  extractFamilyRefFromSubscription,
  resolvePriceIdForPlan,
  PaymentConfigError,
} from "../lib/stripeService";
import { requirePayments } from "../routes/payments";
import { requireFamilyMember, requireFamilyAdmin } from "../middleware/family";
import { reconcileFamilyFromEvent } from "../lib/webhookHandlers";

function mockRes() {
  return {
    statusCode: 0 as number,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
}

describe("validatePlan", () => {
  test("accetta monthly e yearly", () => {
    assert.equal(validatePlan("monthly"), "monthly");
    assert.equal(validatePlan("yearly"), "yearly");
  });

  test("rifiuta piani non validi con INVALID_PLAN", () => {
    for (const bad of ["weekly", "", "MONTHLY", undefined, null, 1, {}]) {
      assert.throws(
        () => validatePlan(bad as any),
        (e: any) => e instanceof PaymentConfigError && e.code === "INVALID_PLAN",
      );
    }
  });
});

describe("PLAN_TO_INTERVAL", () => {
  test("mappa i piani sugli intervalli Stripe", () => {
    assert.equal(PLAN_TO_INTERVAL.monthly, "month");
    assert.equal(PLAN_TO_INTERVAL.yearly, "year");
  });
});

describe("mapStripeStatusToFamily", () => {
  test("active/trialing/past_due -> premium", () => {
    assert.equal(mapStripeStatusToFamily("active"), "premium");
    assert.equal(mapStripeStatusToFamily("trialing"), "premium");
    assert.equal(mapStripeStatusToFamily("past_due"), "premium");
  });

  test("canceled/incomplete/incomplete_expired/unpaid/paused -> canceled", () => {
    assert.equal(mapStripeStatusToFamily("canceled"), "canceled");
    assert.equal(mapStripeStatusToFamily("incomplete"), "canceled");
    assert.equal(mapStripeStatusToFamily("incomplete_expired"), "canceled");
    assert.equal(mapStripeStatusToFamily("unpaid"), "canceled");
    assert.equal(mapStripeStatusToFamily("paused"), "canceled");
  });

  test("valori sconosciuti/null -> canceled", () => {
    assert.equal(mapStripeStatusToFamily(undefined), "canceled");
    assert.equal(mapStripeStatusToFamily(null), "canceled");
    assert.equal(mapStripeStatusToFamily("boh"), "canceled");
  });
});

describe("buildCheckoutSessionParams", () => {
  const params = buildCheckoutSessionParams({
    customerId: "cus_1",
    priceId: "price_1",
    successUrl: "https://app/checkout/success",
    cancelUrl: "https://app/checkout/cancel",
    familyId: "fam_1",
    userId: "user_1",
  });

  test("include familyId e userId nei metadata di sessione", () => {
    assert.equal(params.metadata?.familyId, "fam_1");
    assert.equal(params.metadata?.userId, "user_1");
  });

  test("imposta client_reference_id = familyId", () => {
    assert.equal(params.client_reference_id, "fam_1");
  });

  test("propaga familyId e userId nei metadata della subscription", () => {
    const subData = params.subscription_data as any;
    assert.equal(subData?.metadata?.familyId, "fam_1");
    assert.equal(subData?.metadata?.userId, "user_1");
  });

  test("usa mode subscription e il priceId fornito", () => {
    assert.equal(params.mode, "subscription");
    assert.equal((params.line_items as any)[0].price, "price_1");
  });
});

describe("extractFamilyRefFromSubscription", () => {
  test("preferisce metadata.familyId", () => {
    const ref = extractFamilyRefFromSubscription({
      metadata: { familyId: "fam_meta" },
      customer: "cus_x",
    });
    assert.equal(ref.familyId, "fam_meta");
    assert.equal(ref.customerId, "cus_x");
  });

  test("gestisce customer come oggetto", () => {
    const ref = extractFamilyRefFromSubscription({ customer: { id: "cus_obj" } });
    assert.equal(ref.familyId, undefined);
    assert.equal(ref.customerId, "cus_obj");
  });
});

describe("resolvePriceIdForPlan (priceId scelto lato server)", () => {
  const product = { id: "prod_1", name: "FamilySync Premium", active: true, metadata: { tier: "premium" } };
  const prices = [
    { id: "price_m", active: true, currency: "eur", recurring: { interval: "month" } },
    { id: "price_y", active: true, currency: "eur", recurring: { interval: "year" } },
  ];

  function fakeStripe(opts?: { searchThrows?: boolean; prices?: any[]; products?: any[] }) {
    return {
      products: {
        search: async () => {
          if (opts?.searchThrows) throw new Error("search non disponibile");
          return { data: opts?.products ?? [product] };
        },
        list: async () => ({ data: opts?.products ?? [product] }),
      },
      prices: {
        list: async () => ({ data: opts?.prices ?? prices }),
      },
    } as any;
  }

  test("monthly -> priceId mensile, yearly -> priceId annuale", async () => {
    assert.equal(await resolvePriceIdForPlan("monthly", fakeStripe()), "price_m");
    assert.equal(await resolvePriceIdForPlan("yearly", fakeStripe()), "price_y");
  });

  test("fallback su products.list se search non disponibile", async () => {
    assert.equal(await resolvePriceIdForPlan("monthly", fakeStripe({ searchThrows: true })), "price_m");
  });

  test("rifiuta se nessun prezzo nella valuta corretta (EUR)", async () => {
    const usdOnly = [{ id: "price_usd", active: true, currency: "usd", recurring: { interval: "month" } }];
    await assert.rejects(
      () => resolvePriceIdForPlan("monthly", fakeStripe({ prices: usdOnly })),
      (e: any) => e instanceof PaymentConfigError && e.code === "PRICE_NOT_FOUND",
    );
  });

  test("rifiuta se nessun prezzo attivo per l'intervallo richiesto", async () => {
    const monthlyOnly = [{ id: "price_m", active: true, currency: "eur", recurring: { interval: "month" } }];
    await assert.rejects(
      () => resolvePriceIdForPlan("yearly", fakeStripe({ prices: monthlyOnly })),
      (e: any) => e instanceof PaymentConfigError && e.code === "PRICE_NOT_FOUND",
    );
  });

  test("rifiuta se il prodotto Premium non esiste", async () => {
    await assert.rejects(
      () => resolvePriceIdForPlan("monthly", fakeStripe({ products: [] })),
      (e: any) => e instanceof PaymentConfigError && e.code === "PRODUCT_NOT_FOUND",
    );
  });

  test("rifiuta un piano non valido prima di chiamare Stripe", async () => {
    await assert.rejects(
      () => resolvePriceIdForPlan("weekly" as any, fakeStripe()),
      (e: any) => e instanceof PaymentConfigError && e.code === "INVALID_PLAN",
    );
  });
});

describe("requirePayments (pagamenti disattivi)", () => {
  test("con pagamenti disattivi risponde 503 e non prosegue (nessuna chiamata Stripe)", () => {
    const res = mockRes();
    let nextCalled = false;
    requirePayments({} as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.error?.code, "PAYMENTS_DISABLED");
    assert.equal(nextCalled, false);
  });

  test("checkout bloccato quando i pagamenti sono disattivi", () => {
    const res = mockRes();
    let nextCalled = false;
    requirePayments({ path: "/checkout" } as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.error?.code, "PAYMENTS_DISABLED");
    assert.equal(nextCalled, false);
  });

  test("portal bloccato quando i pagamenti sono disattivi", () => {
    const res = mockRes();
    let nextCalled = false;
    requirePayments({ path: "/portal" } as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.error?.code, "PAYMENTS_DISABLED");
    assert.equal(nextCalled, false);
  });
});

describe("reconcileFamilyFromEvent (webhook -> tabella families)", () => {
  function fakeService() {
    const calls: { subscription: any[]; stripeInfo: Array<{ familyId: string; info: any }> } = {
      subscription: [],
      stripeInfo: [],
    };
    const service = {
      async updateFamilyFromStripeSubscription(sub: any) {
        calls.subscription.push(sub);
        return undefined;
      },
      async updateFamilyStripeInfo(familyId: string, info: any) {
        calls.stripeInfo.push({ familyId, info });
        return undefined as any;
      },
    } as any;
    return { service, calls };
  }

  test("customer.subscription.updated (active) -> riconcilia la subscription", async () => {
    const { service, calls } = fakeService();
    const sub = { id: "sub_1", status: "active", metadata: { familyId: "fam_1" }, current_period_end: 1900000000 };
    await reconcileFamilyFromEvent({ type: "customer.subscription.updated", data: { object: sub } }, service);
    assert.equal(calls.subscription.length, 1);
    assert.equal(calls.subscription[0].id, "sub_1");
    assert.equal(calls.stripeInfo.length, 0);
  });

  test("customer.subscription.deleted (canceled) -> riconcilia la subscription", async () => {
    const { service, calls } = fakeService();
    const sub = { id: "sub_2", status: "canceled", metadata: { familyId: "fam_2" } };
    await reconcileFamilyFromEvent({ type: "customer.subscription.deleted", data: { object: sub } }, service);
    assert.equal(calls.subscription.length, 1);
    assert.equal(calls.subscription[0].status, "canceled");
  });

  test("checkout.session.completed -> collega famiglia con stato premium", async () => {
    const { service, calls } = fakeService();
    const session = {
      client_reference_id: "fam_3",
      customer: "cus_3",
      subscription: "sub_3",
    };
    await reconcileFamilyFromEvent({ type: "checkout.session.completed", data: { object: session } }, service);
    assert.equal(calls.stripeInfo.length, 1);
    assert.equal(calls.stripeInfo[0].familyId, "fam_3");
    assert.equal(calls.stripeInfo[0].info.subscriptionStatus, "premium");
    assert.equal(calls.stripeInfo[0].info.stripeCustomerId, "cus_3");
    assert.equal(calls.stripeInfo[0].info.stripeSubscriptionId, "sub_3");
  });

  test("evento non rilevante -> nessuna scrittura", async () => {
    const { service, calls } = fakeService();
    await reconcileFamilyFromEvent({ type: "invoice.paid", data: { object: {} } }, service);
    assert.equal(calls.subscription.length, 0);
    assert.equal(calls.stripeInfo.length, 0);
  });
});

describe("guardie famiglia: familyId obbligatorio", () => {
  test("requireFamilyMember senza familyId -> 400 MISSING_FAMILY_ID", async () => {
    const res = mockRes();
    let nextCalled = false;
    await requireFamilyMember()(
      { params: {}, body: {}, user: { userId: "u1", email: "" } } as any,
      res as any,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.error?.code, "MISSING_FAMILY_ID");
    assert.equal(nextCalled, false);
  });

  test("requireFamilyAdmin senza familyId -> 400 MISSING_FAMILY_ID", async () => {
    const res = mockRes();
    let nextCalled = false;
    await requireFamilyAdmin()(
      { params: {}, body: {}, user: { userId: "u1", email: "" } } as any,
      res as any,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.error?.code, "MISSING_FAMILY_ID");
    assert.equal(nextCalled, false);
  });
});
