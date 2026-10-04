// Worker RPC for the in-browser AI stack: request/response with progress
// fan-in (model downloads) and token streaming (generation).

export type ProgressFn = (pct: number) => void;

const filePct = new WeakMap<Worker, Map<string, number>>();

function aggregateProgress(w: Worker, data: unknown): number {
  const d = data as { status?: string; file?: string; loaded?: number; total?: number };
  if (!d || d.status !== "progress" || !d.file || !d.total || d.loaded == null) return -1;
  let m = filePct.get(w);
  if (!m) {
    m = new Map();
    filePct.set(w, m);
  }
  m.set(d.file, Math.min(100, Math.round((d.loaded / d.total) * 100)));
  let sum = 0;
  for (const v of m.values()) sum += v;
  return Math.round(sum / m.size);
}

class WorkerRpc {
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private seq = 0;

  constructor(
    private worker: Worker,
    private onProgress?: ProgressFn,
    private onToken?: (t: string) => void
  ) {
    worker.onmessage = (e: MessageEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = e.data as any;
      if (m.type === "progress") {
        const pct = aggregateProgress(this.worker, m.data);
        if (pct >= 0) this.onProgress?.(pct);
        return;
      }
      if (m.type === "token") {
        this.onToken?.(m.text ?? "");
        return;
      }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!;
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(String(m.error)));
        else p.resolve(m);
      }
    };
  }

  call<T>(payload: Record<string, unknown>): Promise<T> {
    const id = `r${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as unknown as (v: unknown) => void,
        reject,
      });
      this.worker.postMessage({ ...payload, id });
    });
  }
}

// One RPC at a time per worker: overlapping calls would overwrite the
// worker's onmessage handler and strand the first caller's promise.
const chains = new WeakMap<Worker, Promise<unknown>>();

function enqueue<T>(w: Worker, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(w) ?? Promise.resolve();
  const next = prev.then(task, task);
  chains.set(w, next.catch(() => {}));
  return next;
}

export function embedTexts(
  w: Worker,
  texts: string[],
  onProgress?: ProgressFn
): Promise<number[][]> {
  return enqueue(w, () => {
    const rpc = new WorkerRpc(w, onProgress);
    return rpc.call<{ vectors: number[][] }>({ kind: "embed", texts }).then(
      (r) => r.vectors
    );
  });
}

export function askLlm(
  w: Worker,
  prompt: string,
  onToken: (t: string) => void,
  onProgress?: ProgressFn
): Promise<string> {
  return enqueue(w, () => {
    const rpc = new WorkerRpc(w, onProgress, onToken);
    return rpc.call<{ text: string }>({ kind: "ask", prompt }).then((r) => r.text);
  });
}
