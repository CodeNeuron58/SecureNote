// Gemma 3 (open weight, 1B instruct) running fully in this tab.
// WebGPU when available, WASM fallback otherwise. No network calls after
// the one-time model download.
import { pipeline, env, TextStreamer } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = "onnx-community/gemma-3-1b-it-ONNX";

const ctx: unknown = self;
let genPromise: Promise<any> | null = null;

function progress(data: unknown) {
  (ctx as Worker).postMessage({ type: "progress", data });
}

function getGenerator(): Promise<any> {
  if (!genPromise) {
    genPromise = (pipeline as any)("text-generation", MODEL, {
      device: "webgpu",
      dtype: "q4f16",
      progress_callback: progress,
    }).catch(() =>
      (pipeline as any)("text-generation", MODEL, {
        dtype: "q4",
        progress_callback: progress,
      })
    );
  }
  return genPromise!;
}

(ctx as Worker).onmessage = async (e: MessageEvent) => {
  const { id, prompt } = e.data || {};
  if (!id) return;
  try {
    const generator = await getGenerator();
    let acc = "";
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (t: string) => {
        acc += t;
        (ctx as Worker).postMessage({ type: "token", text: t });
      },
    });
    const out = await generator([{ role: "user", content: prompt }], {
      max_new_tokens: 320,
      streamer,
    });
    let text = acc;
    if (!text) {
      const full = out?.[0]?.generated_text;
      text =
        typeof full === "string"
          ? full
          : Array.isArray(full)
            ? (full.at(-1)?.content ?? "")
            : "";
    }
    (ctx as Worker).postMessage({ id, text });
  } catch (err) {
    (ctx as Worker).postMessage({
      id,
      error: String((err as Error)?.message || err),
    });
  }
};
