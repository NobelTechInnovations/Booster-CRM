import mongoose from "mongoose";
import { env } from "./env.js";

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase() {
  // Already connected (e.g. a warm serverless container reusing this module) — skip.
  if (mongoose.connection.readyState === 1) return;

  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);

  try {
    // 8s, not 3s: on Vercel this is a cold TLS handshake to Atlas over the public
    // internet on every new container, which is slower than a local/same-region dev run.
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
    await dropLegacyIndexes();
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (error) {
    if (env.nodeEnv === "production") {
      throw error;
    }

    console.warn("MongoDB not available. Running backend with in-memory development store.");
    console.warn(error.message);
  }
}

// Serverless-safe wrapper around connectDatabase(). A Vercel function has no
// long-running bootstrap step like server.js's `await connectDatabase()` before
// `app.listen()` — every request just hits the exported Express app directly, so
// without this the DB was never connected at all and every request silently ran
// on the in-memory store (see the "vercal" commit that added `export default
// createApp()` to app.js without anything ever awaiting connectDatabase() first).
//
// This is called from request middleware in app.js instead:
//  - readyState === 1 (already connected, e.g. a warm container reusing this
//    module between invocations) resolves instantly, no reconnect overhead.
//  - a connection already in flight (e.g. two requests hit a cold container back
//    to back) is awaited once and shared, instead of racing two mongoose.connect() calls.
//  - otherwise it kicks off connectDatabase() and caches the in-flight promise
//    until it settles.
let connectingPromise = null;

export async function ensureDatabaseConnected() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectingPromise) {
    connectingPromise = connectDatabase().finally(() => {
      connectingPromise = null;
    });
  }
  return connectingPromise;
}

async function dropLegacyIndexes() {
  const collections = await mongoose.connection.db.listCollections({ name: "users" }).toArray();

  if (collections.length === 0) {
    return;
  }

  await mongoose.connection.db
    .collection("users")
    .dropIndex("email_1")
    .catch((error) => {
      if (error.codeName !== "IndexNotFound") {
        throw error;
      }
    });
}
