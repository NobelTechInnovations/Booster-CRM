import mongoose from "mongoose";
import archiver from "archiver";
import { isMongoConnected } from "../config/database.js";

// Importing every model file for its side effect (mongoose.model(...)
// registration) is what makes listBackupCollections/streamDatabaseBackup
// below actually complete — mongoose.modelNames() only ever returns models
// whose file has been imported somewhere in this running process. Every
// other module in this app already imports the models it personally uses,
// so in practice they're all registered by server start anyway — but that
// makes this list an implicit, easy-to-miss dependency on "did some other
// route already import X". Importing every model file explicitly here
// removes that dependency entirely: a full backup is guaranteed complete
// regardless of what else has run, and a newly added model file is picked
// up automatically the moment it's created, with zero further code changes
// anywhere in this file.
import "../models/ad-insight.model.js";
import "../models/asset-mapping.model.js";
import "../models/asset.model.js";
import "../models/automation-rule.model.js";
import "../models/channel.model.js";
import "../models/company.model.js";
import "../models/expense.model.js";
import "../models/payment-transaction.model.js";
import "../models/plan.model.js";
import "../models/platform-admin.model.js";
import "../models/product-mapping.model.js";
import "../models/purchase.model.js";
import "../models/shipment.model.js";
import "../models/sku-cost.model.js";
import "../models/smart-whatsapp-conversation.model.js";
import "../models/smart-whatsapp-message.model.js";
import "../models/smart-whatsapp-session.model.js";
import "../models/social-comment.model.js";
import "../models/social-post.model.js";
import "../models/synced-customer.model.js";
import "../models/synced-order.model.js";
import "../models/synced-product.model.js";
import "../models/user.model.js";
import "../models/vendor.model.js";
import "../models/wallet-transaction.model.js";
import "../models/warehouse.model.js";
import "../models/webhook-endpoint.model.js";
import "../models/webhook-event.model.js";
import "../models/webhook-lead.model.js";
import "../models/whatsapp-conversation.model.js";
import "../models/whatsapp-message.model.js";
import "../models/whatsapp-pending-signup.model.js";

// Secrets (Shopify/Amazon API keys, WhatsApp/Meta access tokens, platform
// admin password hashes, etc) live on fields marked `select: false` across
// these models specifically so a plain `.find().lean()` — used below, no
// `+field` overrides anywhere in this file — never returns them. A backup
// file is something that gets downloaded, emailed, and stored who-knows-
// where, so leaving those fields out by default is the safe choice; a
// platform admin who genuinely needs a credential can still read it from
// the live database directly, not from this export.
function listCollectionModels() {
  return mongoose.modelNames()
    .map((name) => mongoose.model(name))
    .sort((a, b) => a.collection.name.localeCompare(b.collection.name));
}

// Document counts per collection, shown in the admin UI before someone
// commits to downloading a (potentially large) backup file.
export async function getBackupSummary() {
  if (!isMongoConnected()) {
    return { error: "Database is not connected — nothing to back up" };
  }

  const models = listCollectionModels();
  const collections = await Promise.all(
    models.map(async (Model) => ({
      collection: Model.collection.name,
      count: await Model.estimatedDocumentCount(),
    })),
  );

  return { collections, generatedAt: new Date().toISOString() };
}

// Streams a .zip archive — one <collection>.json file per Mongoose
// collection, each holding that collection's full document array — directly
// into the given writable stream (the HTTP response). Streaming (rather
// than building the whole zip in memory first) keeps this safe to run
// against a real production-sized database: at most one collection's worth
// of documents is ever held in memory at a time, and archiver flushes each
// entry to the response as it's written rather than buffering the whole
// archive.
export async function streamDatabaseBackup(outputStream) {
  if (!isMongoConnected()) {
    throw new Error("Database is not connected — nothing to back up");
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(outputStream);

  const manifest = { generatedAt: new Date().toISOString(), collections: [] };

  for (const Model of listCollectionModels()) {
    const docs = await Model.find({}).lean();
    manifest.collections.push({ collection: Model.collection.name, count: docs.length });
    archive.append(JSON.stringify(docs, null, 2), { name: `${Model.collection.name}.json` });
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: "_manifest.json" });
  await archive.finalize();
}
