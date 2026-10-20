import { createRequestHandler } from "react-router";
// @ts-expect-error - app/db.server is plain JS
import { setD1 } from "../app/db.server";

const requestHandler = createRequestHandler(
  // @ts-ignore - virtual module provided by React Router at build time
  () => import("virtual:react-router/server-build"),
  "production",
);

export default {
  async fetch(request: Request, env: any, ctx: any) {
    setD1(env.DB);
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
};
