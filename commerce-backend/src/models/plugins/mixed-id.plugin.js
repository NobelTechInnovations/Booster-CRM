import mongoose from "mongoose";

// companyId / channelId are stored as a STRING on older rows and as an
// ObjectId on newer ones (production still has ~6,000 string ids across 30
// collections — scripts/migrate-normalize-ids.js was never applied there).
// Typing the fields as ObjectId made Mongoose cast every query value to
// ObjectId, so every string-stored row — most of a workspace's leads, orders
// and customers — silently stopped matching.
//
// This plugin makes the storage type irrelevant instead of requiring a write
// to live data first:
//   - reads: an equality on either field matches both representations
//   - writes: new values are stored as ObjectId, so the data converges by itself
//
// The fields are declared as Mixed in the models so Mongoose doesn't cast the
// string variant away before the query reaches MongoDB. Once the migration has
// been run everywhere this still works unchanged — it just never sees a string.

const ID_PATHS = new Set(["companyId", "channelId", "vendorId"]);
const HEX_24 = /^[a-f0-9]{24}$/i;

const { ObjectId } = mongoose.Types;

function isIdPath(key) {
  return ID_PATHS.has(key.slice(key.lastIndexOf(".") + 1));
}

function toObjectId(value) {
  return typeof value === "string" && HEX_24.test(value) ? new ObjectId(value) : value;
}

// Both stored forms of one id value, or null when it isn't an id at all.
function variants(value) {
  if (value instanceof ObjectId) return [value, value.toHexString()];
  if (typeof value === "string" && HEX_24.test(value)) return [new ObjectId(value), value];
  return null;
}

function expandList(list) {
  return list.flatMap((item) => variants(item) || [item]);
}

function expandCondition(condition) {
  const direct = variants(condition);
  if (direct) return { $in: direct };

  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return condition;

  const next = { ...condition };
  if (Array.isArray(next.$in)) next.$in = expandList(next.$in);
  if (Array.isArray(next.$nin)) next.$nin = expandList(next.$nin);
  if ("$eq" in next && variants(next.$eq)) {
    next.$in = [...(next.$in || []), ...variants(next.$eq)];
    delete next.$eq;
  }
  if ("$ne" in next && variants(next.$ne)) {
    next.$nin = [...(next.$nin || []), ...variants(next.$ne)];
    delete next.$ne;
  }
  return next;
}

export function expandIdFilter(filter) {
  if (!filter || typeof filter !== "object") return filter;

  const next = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or" || key === "$nor") next[key] = value.map(expandIdFilter);
    else if (isIdPath(key)) next[key] = expandCondition(value);
    else next[key] = value;
  }
  return next;
}

function normalizeWrite(target) {
  if (!target || typeof target !== "object") return;
  for (const key of Object.keys(target)) {
    if (isIdPath(key)) target[key] = toObjectId(target[key]);
  }
}

// Hex forms of whatever the filter pins an id path to (plain value or $in).
function filterIds(condition) {
  const list = Array.isArray(condition?.$in) ? condition.$in : [condition];
  return new Set(list.map((value) => variants(value)?.[1]).filter(Boolean));
}

// Prepares an update for an expanded filter:
//   - an id the filter already pins is dropped from $set. Re-setting it is a
//     no-op semantically, but rewriting a string-stored row to ObjectId could
//     collide on a unique index with an ObjectId copy of the same record.
//   - on upsert the id goes into $setOnInsert as an ObjectId, because MongoDB
//     copies plain equalities from the filter into the inserted document but
//     not an $in — without this a new row would be created with no companyId.
//   - any other id written is stored as an ObjectId.
function prepareUpdate(filter, update, upsert) {
  if (!update || typeof update !== "object" || Array.isArray(update)) return;

  for (const path of ID_PATHS) {
    const pinned = filter && path in filter ? filterIds(filter[path]) : new Set();
    for (const target of [update, update.$set]) {
      if (!target || !(path in target)) continue;
      const hex = variants(target[path])?.[1];
      if (hex && pinned.has(hex)) delete target[path];
      else target[path] = toObjectId(target[path]);
    }

    if (update.$setOnInsert && path in update.$setOnInsert) {
      update.$setOnInsert[path] = toObjectId(update.$setOnInsert[path]);
    } else if (upsert && pinned.size === 1 && !(path in update) && !(path in (update.$set || {}))) {
      update.$setOnInsert = { ...(update.$setOnInsert || {}), [path]: new ObjectId([...pinned][0]) };
    }
  }
}

const QUERY_HOOKS = [
  "find",
  "findOne",
  "countDocuments",
  "distinct",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
];

export function mixedIdPlugin(schema) {
  schema.pre(QUERY_HOOKS, { document: false, query: true }, function expandQueryIds() {
    const filter = this.getFilter();
    const update = this.getUpdate();

    if (update) {
      prepareUpdate(filter, update, this.getOptions().upsert);
      this.setUpdate(update);
    }
    this.setQuery(expandIdFilter(filter));
  });

  schema.pre("aggregate", function expandAggregateIds() {
    for (const stage of this.pipeline()) {
      if (stage.$match) stage.$match = expandIdFilter(stage.$match);
    }
  });

  schema.pre("validate", function normalizeDocumentIds() {
    for (const path of ID_PATHS) {
      if (schema.path(path) && typeof this.get(path) === "string") this.set(path, toObjectId(this.get(path)));
    }
  });

  schema.pre("insertMany", function normalizeInsertedIds(docs) {
    for (const doc of Array.isArray(docs) ? docs : [docs]) normalizeWrite(doc);
  });

  schema.pre("bulkWrite", function normalizeBulkIds(ops) {
    for (const op of ops || []) {
      if (op.insertOne) normalizeWrite(op.insertOne.document);
      for (const kind of ["updateOne", "updateMany"]) {
        if (!op[kind]) continue;
        prepareUpdate(op[kind].filter, op[kind].update, op[kind].upsert);
        op[kind].filter = expandIdFilter(op[kind].filter);
      }
      for (const kind of ["deleteOne", "deleteMany", "replaceOne"]) {
        if (op[kind]) op[kind].filter = expandIdFilter(op[kind].filter);
      }
    }
  });
}

// Global, so it reaches every model — this module must be imported before any
// model is compiled (it is the first import of app.js and server.js).
mongoose.plugin(mixedIdPlugin);
