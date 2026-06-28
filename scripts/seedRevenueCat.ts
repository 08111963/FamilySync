import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "FamilySync";

const ENTITLEMENT_IDENTIFIER = "premium";
const ENTITLEMENT_DISPLAY_NAME = "Premium Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

const APP_STORE_APP_NAME = "FamilySync iOS";
const APP_STORE_BUNDLE_ID = "com.familysyncapp.coordinator";
const PLAY_STORE_APP_NAME = "FamilySync Android";
const PLAY_STORE_PACKAGE_NAME = "com.familysyncapp.coordinator";

type PlanConfig = {
  label: string;
  storeIdentifier: string;
  playStoreIdentifier: string; // format {subscriptionId}:{basePlanId}
  displayName: string;
  title: string;
  duration: "P1W" | "P1M" | "P2M" | "P3M" | "P6M" | "P1Y";
  prices: { amount_micros: number; currency: string }[];
  packageIdentifier: string; // e.g. $rc_monthly, $rc_annual
  packageDisplayName: string;
};

const PLANS: PlanConfig[] = [
  {
    label: "Monthly",
    storeIdentifier: "familysync_premium_monthly",
    playStoreIdentifier: "familysync_premium_monthly:monthly",
    displayName: "Premium Mensile",
    title: "FamilySync Premium (Mensile)",
    duration: "P1M",
    prices: [{ amount_micros: 3990000, currency: "EUR" }],
    packageIdentifier: "$rc_monthly",
    packageDisplayName: "Abbonamento Mensile",
  },
  {
    label: "Yearly",
    storeIdentifier: "familysync_premium_yearly",
    playStoreIdentifier: "familysync_premium_yearly:yearly",
    displayName: "Premium Annuale",
    title: "FamilySync Premium (Annuale)",
    duration: "P1Y",
    prices: [{ amount_micros: 39990000, currency: "EUR" }],
    packageIdentifier: "$rc_annual",
    packageDisplayName: "Abbonamento Annuale",
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = getUncachableRevenueCatClient();

  // ---- Project ----
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 50 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");

  const project = existingProjects?.items?.find(
    (p) => (p.name ?? "").trim() === PROJECT_NAME,
  ) as Project | undefined;
  if (!project) throw new Error(`Project "${PROJECT_NAME}" not found`);
  console.log("Using project:", project.id, `("${project.name}")`);

  // ---- Apps ----
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps || apps.items.length === 0) {
    throw new Error("No apps found");
  }

  let testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!testStoreApp) throw new Error("No test_store app found");
  console.log("Test Store app:", testStoreApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  // ---- Products ----
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProductForApp = async (
    targetApp: App,
    plan: PlanConfig,
    productIdentifier: string,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existingProduct = existingProducts.items?.find(
      (p) => p.store_identifier === productIdentifier && p.app_id === targetApp.id,
    );
    if (existingProduct) {
      console.log(`[${plan.label}] ${targetApp.type} product exists:`, existingProduct.id);
      return existingProduct;
    }

    const body: CreateProductData["body"] = {
      store_identifier: productIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: plan.displayName,
    };
    if (isTestStore) {
      body.subscription = { duration: plan.duration };
      body.title = plan.title;
    }

    const { data: createdProduct, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create ${plan.label} ${targetApp.type} product: ${JSON.stringify(error)}`);
    console.log(`[${plan.label}] Created ${targetApp.type} product:`, createdProduct.id);
    return createdProduct;
  };

  const allProductIdsByPlan: { plan: PlanConfig; productIds: string[]; testStoreProductId: string }[] = [];

  for (const plan of PLANS) {
    const testStoreProduct = await ensureProductForApp(testStoreApp, plan, plan.storeIdentifier, true);
    const appStoreProduct = await ensureProductForApp(appStoreApp, plan, plan.storeIdentifier, false);
    const playStoreProduct = await ensureProductForApp(playStoreApp, plan, plan.playStoreIdentifier, false);

    // Test store prices (undocumented endpoint)
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: testStoreProduct.id },
      body: { prices: plan.prices },
    });
    if (priceError) {
      if (priceError && typeof priceError === "object" && "type" in priceError && (priceError as any).type === "resource_already_exists") {
        console.log(`[${plan.label}] Test store prices already exist`);
      } else {
        throw new Error(`Failed to add ${plan.label} test store prices: ${JSON.stringify(priceError)}`);
      }
    } else {
      console.log(`[${plan.label}] Added test store prices:`, JSON.stringify(plan.prices));
    }

    allProductIdsByPlan.push({
      plan,
      productIds: [testStoreProduct.id, appStoreProduct.id, playStoreProduct.id],
      testStoreProductId: testStoreProduct.id,
    });
  }

  // ---- Entitlement ----
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (existingEntitlement) {
    console.log("Entitlement exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", newEntitlement.id);
    entitlement = newEntitlement;
  }

  const allProductIds = allProductIdsByPlan.flatMap((p) => p.productIds);
  const { error: attachEntitlementError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });
  if (attachEntitlementError) {
    if ((attachEntitlementError as any).type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement (some/all)");
    } else {
      throw new Error(`Failed to attach products to entitlement: ${JSON.stringify(attachEntitlementError)}`);
    }
  } else {
    console.log("Attached products to entitlement");
  }

  // ---- Offering ----
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOffering) {
    console.log("Offering exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOffering.id);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // ---- Packages ----
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 50 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  for (const { plan, productIds } of allProductIdsByPlan) {
    let pkg: Package | undefined = existingPackages.items?.find((p) => p.lookup_key === plan.packageIdentifier);
    if (pkg) {
      console.log(`[${plan.label}] Package exists:`, pkg.id);
    } else {
      const { data: newPackage, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: { lookup_key: plan.packageIdentifier, display_name: plan.packageDisplayName },
      });
      if (error) throw new Error(`Failed to create ${plan.label} package: ${JSON.stringify(error)}`);
      console.log(`[${plan.label}] Created package:`, newPackage.id);
      pkg = newPackage;
    }

    const { error: attachPackageError } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: productIds.map((product_id) => ({ product_id, eligibility_criteria: "all" as const })),
      },
    });
    if (attachPackageError) {
      if ((attachPackageError as any).type === "unprocessable_entity_error") {
        console.log(`[${plan.label}] Package products already attached (or incompatible) — skipping`);
      } else {
        throw new Error(`Failed to attach products to ${plan.label} package: ${JSON.stringify(attachPackageError)}`);
      }
    } else {
      console.log(`[${plan.label}] Attached products to package`);
    }
  }

  // ---- Public API Keys ----
  const fetchKeys = async (app: App, label: string) => {
    const { data, error } = await listAppPublicApiKeys({
      client,
      path: { project_id: project.id, app_id: app.id },
    });
    if (error) throw new Error(`Failed to list public API keys for ${label}`);
    return data?.items?.map((item) => item.key).join(", ") ?? "N/A";
  };

  const testStoreKeys = await fetchKeys(testStoreApp, "Test Store");
  const appStoreKeys = await fetchKeys(appStoreApp, "App Store");
  const playStoreKeys = await fetchKeys(playStoreApp, "Play Store");

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("REVENUECAT_PROJECT_ID:", project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID:", testStoreApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID:", appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:", testStoreKeys);
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:", appStoreKeys);
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:", playStoreKeys);
  console.log("====================\n");
}

seedRevenueCat().catch((e) => {
  console.error(e);
  process.exit(1);
});
