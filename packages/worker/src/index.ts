import { handleApiRequest } from "./api";
import { handleAuthRequest } from "./auth";
import { corsPreflight, Env, json, withCors } from "./utils";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))) {
      return corsPreflight(request);
    }

    try {
      if (url.pathname.startsWith("/api/auth/")) {
        return withCors(request, await handleAuthRequest(request, env, url.pathname));
      }

      if (url.pathname.startsWith("/api/")) {
        return withCors(request, await handleApiRequest(request, env, url.pathname));
      }

      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }

        const indexRequest = new Request(new URL("/index.html", url).toString(), request);
        return env.ASSETS.fetch(indexRequest);
      }

      return json({
        name: "AI Builder API",
        status: "ok",
      });
    } catch (error) {
      return withCors(
        request,
        json(
          {
            error: error instanceof Error ? error.message : "Unexpected server error.",
          },
          { status: 500 },
        ),
      );
    }
  },
};
