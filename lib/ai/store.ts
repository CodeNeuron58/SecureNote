// Local vector store: embeddings of the user's own decrypted notes, kept in
// IndexedDB in the browser. Nothing here is ever sent to the server.
import { openDB, type IDBPDatabase } from "idb";
import { cosine } from "./rag";

type ChunkRow = { noteId: string; idx: number; text: string; vec: number[]; title: string };
type MetaRow = { noteId: string; version: string; chunks: number };

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB("securenote-ai", 1, {
      upgrade(d) {
        d.createObjectStore("chunks", { keyPath: ["noteId", "idx"] });
        d.createObjectStore("meta", { keyPath: "noteId" });
      },
    });
  }
  return dbp;
}

export async function getNoteVersion(noteId: string): Promise<string | undefined> {
  const m = (await (await db()).get("meta", noteId)) as MetaRow | undefined;
  return m?.version;
}

export async function saveNoteChunks(
  noteId: string,
  version: string,
  title: string,
  chunks: string[],
  vectors: number[][]
): Promise<void> {
  const d = await db();
  const tx = d.transaction(["chunks", "meta"], "readwrite");
  await tx.objectStore("chunks").delete(IDBKeyRange.bound([noteId, 0], [noteId, Infinity]));
  for (let i = 0; i < chunks.length; i++) {
    const row: ChunkRow = { noteId, idx: i, text: chunks[i], vec: vectors[i], title };
    await tx.objectStore("chunks").put(row);
  }
  const meta: MetaRow = { noteId, version, chunks: chunks.length };
  await tx.objectStore("meta").put(meta);
  await tx.done;
}

export async function deleteNoteChunks(noteId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["chunks", "meta"], "readwrite");
  await tx.objectStore("chunks").delete(IDBKeyRange.bound([noteId, 0], [noteId, Infinity]));
  await tx.objectStore("meta").delete(noteId);
  await tx.done;
}

export type SearchHit = { noteId: string; title: string; text: string; score: number };

export async function searchAll(queryVec: number[], k = 6): Promise<SearchHit[]> {
  const d = await db();
  const hits: SearchHit[] = [];
  let cursor = await d.transaction("chunks").store.openCursor();
  while (cursor) {
    const row = cursor.value as ChunkRow;
    hits.push({
      noteId: row.noteId,
      title: row.title,
      text: row.text,
      score: cosine(queryVec, row.vec),
    });
    cursor = await cursor.continue();
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}
