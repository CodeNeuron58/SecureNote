// Chunking, similarity and prompt construction for the local RAG pipeline.

export function chunkText(text: string, size = 700, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    let cut = end;
    if (end < clean.length) {
      const brk = clean.lastIndexOf("\n", end);
      if (brk > i + size * 0.5) cut = brk;
    }
    chunks.push(clean.slice(i, cut).trim());
    if (cut >= clean.length) break;
    i = cut - overlap > i ? cut - overlap : cut;
  }
  return chunks.filter(Boolean);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export function buildPrompt(
  question: string,
  hits: { title: string; text: string }[]
): string {
  const excerpts = hits
    .map((h, i) => `[${i + 1}] Note: "${h.title}"\n${h.text}`)
    .join("\n\n");
  return (
    `You are the local assistant inside SecureNote, a private notes app. ` +
    `The note excerpts below were decrypted inside the user's browser and never left this device. ` +
    `Answer the user's question using only the excerpts. Cite them like [1], [2]. ` +
    `If the excerpts do not contain the answer, say so in one sentence. Be concise.\n\n` +
    `NOTES:\n${excerpts}\n\nQUESTION: ${question}`
  );
}
