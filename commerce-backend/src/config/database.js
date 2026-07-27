import mongoose from "mongoose";
import { env } from "./env.js";

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);

  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 3000 });
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
