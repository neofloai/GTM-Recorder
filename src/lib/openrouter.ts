const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-5.6-terra";

function headers(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing required env var OPENROUTER_API_KEY");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Optional attribution headers OpenRouter uses for its dashboards.
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_APP_NAME || "Recorder",
  };
}

/**
 * Streams a completion as plain UTF-8 text deltas. We unwrap OpenRouter's SSE
 * here so the browser can just read the response body as text.
 */
export async function streamChat(
  messages: LlmMessage[],
  model: string = DEFAULT_MODEL,
  onDone?: (fullText: string) => Promise<void> | void,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.2 }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const upstream = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let cancelled = false;

  // An explicit pump in start() rather than a pull()-driven stream: OpenRouter
  // opens with several ": OPENROUTER PROCESSING" keep-alive frames that yield no
  // delta, and a pull() that enqueues nothing stalls the stream.
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let full = "";

      try {
        while (!cancelled) {
          const { done, value } = await upstream.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE frames are newline-delimited; hold the trailing partial line back.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            // Skips both blank lines and ": OPENROUTER PROCESSING" comments.
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta: string = parsed?.choices?.[0]?.delta?.content ?? "";
              if (delta) {
                full += delta;
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // A frame split across chunk boundaries; the tail is in `buffer`.
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
        return;
      }

      // Runs after close(), so persisting the answer never delays the reader.
      // A failed write must not surface as a stream error.
      try {
        if (!cancelled) await onDone?.(full);
      } catch (err) {
        console.error("[openrouter] onDone failed:", err);
      }
    },
    async cancel() {
      // The reader went away — stop pumping so we don't keep billing tokens.
      cancelled = true;
      await upstream.cancel().catch(() => {});
    },
  });
}

/** One-shot, non-streaming completion — used for summaries. */
export async function complete(
  messages: LlmMessage[],
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenRouter returned an empty completion");
  return content;
}

export type OpenRouterModel = { id: string; name: string; contextLength: number };

/** Variants that aren't useful for summarizing or chatting about a transcript. */
const EXCLUDED = /(-image|-audio|-codex|:batch|:free|instruct)/;

/**
 * OpenAI chat models, for the picker. OpenRouter lists 400+ models, which is an
 * unusable dropdown on a phone, and this app is configured for OpenAI — so the
 * list is narrowed to `openai/*` with the configured default pinned first.
 */
export async function listModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`OpenRouter models failed (${res.status})`);
  const json = (await res.json()) as {
    data?: Array<{ id: string; name?: string; context_length?: number }>;
  };

  const models = (json.data ?? [])
    .filter((m) => m.id.startsWith("openai/") && !EXCLUDED.test(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextLength: m.context_length ?? 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Keep the default reachable without scrolling, and present even if OpenRouter
  // stops listing it.
  const rest = models.filter((m) => m.id !== DEFAULT_MODEL);
  const current =
    models.find((m) => m.id === DEFAULT_MODEL) ??
    ({ id: DEFAULT_MODEL, name: DEFAULT_MODEL, contextLength: 0 } as OpenRouterModel);
  return [current, ...rest];
}
