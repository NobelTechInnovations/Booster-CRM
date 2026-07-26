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
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (error) {
    if (env.nodeEnv === "production") {
      throw error;
    }

    console.warn("MongoDB not available. Running backend with in-memory development store.");
    console.warn(error.message);
  }
}
