import { listModels, DEFAULT_MODEL } from "@/lib/openrouter";

/**
 * Must run per request. With `revalidate` alone Next prerendered this at build
 * time, where OPENROUTER_API_KEY isn't set on a CI/deploy machine — baking an
 * empty model list into the static output and serving it until the cache expired.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ models: await listModels(), defaultModel: DEFAULT_MODEL });
  } catch (err) {
    // A missing key or a flaky catalogue shouldn't break chat — the UI just
    // falls back to the configured default model.
    return Response.json({
      models: [],
      defaultModel: DEFAULT_MODEL,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
