import { createClient } from "@replit/revenuecat-sdk/client";
import { ReplitConnectors } from "@replit/connectors-sdk";

const REVENUECAT_API_BASE_URL = "https://api.revenuecat.com/v2";
const CONNECTOR_NAME = "revenuecat";

let cachedClient: ReturnType<typeof createClient> | null = null;

/**
 * Returns an authenticated RevenueCat REST client.
 *
 * Authentication is handled by the Replit connectors proxy: the proxy-fetch
 * rewrites every request to api.revenuecat.com through the connector proxy,
 * injecting (and refreshing) the OAuth credentials automatically. We never
 * handle or cache the RevenueCat token ourselves.
 */
export function getUncachableRevenueCatClient() {
  if (cachedClient) return cachedClient;

  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch(CONNECTOR_NAME);

  cachedClient = createClient({
    baseUrl: REVENUECAT_API_BASE_URL,
    fetch: proxyFetch,
  });

  return cachedClient;
}
