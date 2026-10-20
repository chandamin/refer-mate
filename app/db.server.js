import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

// On Cloudflare the worker (workers/app.ts) hands us the D1 binding on every
// request. Under `shopify app dev` (Node) there is no binding, so we fall back
// to the local sqlite file from prisma/schema.prisma.
let d1;
let client;

export function setD1(binding) {
  if (binding && binding !== d1) {
    d1 = binding;
    client = new PrismaClient({ adapter: new PrismaD1(binding) });
  }
}

function getClient() {
  if (client) return client;
  if (!global.prismaGlobal) global.prismaGlobal = new PrismaClient();
  return global.prismaGlobal;
}

// Same `prisma.model.method()` API as before, resolved lazily per call.
const prisma = new Proxy(
  {},
  {
    get: (_target, prop) => {
      const c = getClient();
      const value = c[prop];
      return typeof value === "function" ? value.bind(c) : value;
    },
  },
);

export default prisma;
