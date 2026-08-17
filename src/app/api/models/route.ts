import { listModels, DEFAULT_MODEL } from "@/lib/openrouter";

/** OpenRouter's catalogue changes slowly; an hour of caching is plenty. */
export const revalidate = 3600;

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
