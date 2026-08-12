import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const companyId = "6a760fb598c6c64528123d91";

// For the ad that matched (120250539333030661), find ALL its insight dates
const rows = await db.collection("adinsights").find({ companyId, adId: "120250539333030661" }).sort({date:1}).toArray();
console.log("All insight dates for adId 120250539333030661:", rows.map(r => new Date(r.date).toISOString().slice(0,10)));

// Order was placed 2026-08-07. Check how many days away the nearest insight row is.
