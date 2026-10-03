import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;

declare global {
  var __snMongo: Promise<MongoClient> | undefined;
}

export async function getDb(): Promise<Db> {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!globalThis.__snMongo) {
    globalThis.__snMongo = new MongoClient(uri)
      .connect()
      .then(async (client) => {
        const db = client.db("securenote");
        try {
          await db.collection("users").createIndex({ email: 1 }, { unique: true });
          await db
            .collection("grants")
            .createIndex({ noteId: 1, viewerId: 1 }, { unique: true });
          await db.collection("views").createIndex({ noteId: 1, at: -1 });
          await db.collection("notes").createIndex({ ownerId: 1 });
        } catch {
          // index creation is best-effort; the app works without them
        }
        return client;
      });
  }
  const client = await globalThis.__snMongo;
  return client.db("securenote");
}
