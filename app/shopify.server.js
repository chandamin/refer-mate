import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Built lazily: on Cloudflare Workers, env vars/secrets are only available
// once a request is being handled, not while the module is first evaluated.
let instance;
function getShopify() {
  instance ??= shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.July26,
    scopes: process.env.SCOPES?.split(","),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: new PrismaSessionStorage(prisma),
    distribution: AppDistribution.AppStore,
    future: {
      expiringOfflineAccessTokens: true,
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });
  return instance;
}

const lazy = (pick) =>
  new Proxy(
    {},
    {
      get: (_t, prop) => {
        const target = pick(getShopify());
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    },
  );

// authenticate/unauthenticated are objects with nested helpers; login,
// registerWebhooks and addDocumentResponseHeaders are plain functions.
export const apiVersion = ApiVersion.July26;
export const authenticate = lazy((s) => s.authenticate);
export const unauthenticated = lazy((s) => s.unauthenticated);
export const sessionStorage = lazy((s) => s.sessionStorage);
export const login = (...args) => getShopify().login(...args);
export const registerWebhooks = (...args) =>
  getShopify().registerWebhooks(...args);
export const addDocumentResponseHeaders = (...args) =>
  getShopify().addDocumentResponseHeaders(...args);

export default { get instance() { return getShopify(); } };
