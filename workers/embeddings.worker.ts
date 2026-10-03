// Embedding worker: MiniLM running locally via transformers.js (WASM).
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const ctx: unknown = self;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;

function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = (pipeline as any)(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      {
        progress_callback: (data: unknown) =>
          (ctx as Worker).postMessage({ type: "progress", data }),
      }
    );
  }
  return extractorPromise!;
}

(ctx as Worker).onmessage = async (e: MessageEvent) => {
  const { id, texts } = e.data || {};
  if (!id) return;
  try {
    const extractor: any = await getExtractor();
    const out = await extractor(texts, { pooling: "mean", normalize: true });
    (ctx as Worker).postMessage({ id, vectors: out.tolist() });
  } catch (err) {
    (ctx as Worker).postMessage({
      id,
      error: String((err as Error)?.message || err),
    });
  }
};
