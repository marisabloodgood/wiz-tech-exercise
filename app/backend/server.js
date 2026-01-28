const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Missing MONGO_URI env var");
  process.exit(1);
}

let db;

MongoClient.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  .then((client) => {
    db = client.db(); // uses DB from URI
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

function requireDb(res) {
  if (!db) {
    res.status(503).json({ error: "MongoDB not connected" });
    return false;
  }
  return true;
}

function toObjectId(id, res) {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid id format" });
    return null;
  }
  return new ObjectId(id);
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/", (req, res) => res.status(404).send("backend root - use /api/*"));
});

// REGATTAS
app.get("/api/regattas", async (req, res) => {
  if (!requireDb(res)) return;
  const regattas = await db.collection("regattas").find().toArray();
  res.json(regattas);
});

app.post("/api/regattas", async (req, res) => {
  if (!requireDb(res)) return;
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: "name is required" });
  if (!Array.isArray(payload.assignments)) payload.assignments = [];
  const result = await db.collection("regattas").insertOne(payload);
  const created = await db.collection("regattas").findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

app.put("/api/regattas/:id", async (req, res) => {
  if (!requireDb(res)) return;
  const oid = toObjectId(req.params.id, res);
  if (!oid) return;
  const payload = req.body || {};
  delete payload._id;
  const r = await db.collection("regattas").updateOne({ _id: oid }, { $set: payload });
  if (!r.matchedCount) return res.status(404).json({ error: "not found" });
  const updated = await db.collection("regattas").findOne({ _id: oid });
  res.json(updated);
});

// CREW
app.get("/api/crew-members", async (req, res) => {
  if (!requireDb(res)) return;
  const crew = await db.collection("crew_members").find().toArray();
  res.json(crew);
});

app.post("/api/crew-members", async (req, res) => {
  if (!requireDb(res)) return;
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: "name is required" });
  const result = await db.collection("crew_members").insertOne(payload);
  const created = await db.collection("crew_members").findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

app.put("/api/crew-members/:id", async (req, res) => {
  if (!requireDb(res)) return;
  const oid = toObjectId(req.params.id, res);
  if (!oid) return;
  const payload = req.body || {};
  delete payload._id;
  const r = await db.collection("crew_members").updateOne({ _id: oid }, { $set: payload });
  if (!r.matchedCount) return res.status(404).json({ error: "not found" });
  const updated = await db.collection("crew_members").findOne({ _id: oid });
  res.json(updated);
});

app.listen(PORT, () => console.log(`Regatta API listening on port ${PORT}`));

app.get("/", (req, res) => {
  res.status(200).send("Blond Fury Regatta Tracker API is running. Try /health or /api/regattas");
});