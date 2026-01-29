const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json());

// --- CORS ---
// For dev (Vite on 5173), allow localhost origin.
// For prod, you can tighten this to regattas.blondfury.com.
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://regattas.blondfury.com",
      "https://regattas.blondfury.com",
    ],
    credentials: false,
  })
);

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "wiz-exercise-dev-secret";

// Demo admin credentials (from env)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@blondfury.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";

if (!MONGO_URI) {
  console.error("Missing MONGO_URI env var");
  process.exit(1);
}

let db;

// --- Mongo connect ---
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

function signToken(user) {
  // keep payload small
  return jwt.sign(
    {
      role: user.role,
      email: user.email,
      crewMemberId: user.crewMemberId || null,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const parts = h.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }
  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { role,email,crewMemberId }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

function adminOrSelfCrew(req, res, next) {
  // for /api/crew-members/:id
  const id = String(req.params.id || "");
  const selfId = req.user?.crewMemberId ? String(req.user.crewMemberId) : "";
  if (req.user?.role === "admin" || (selfId && id === selfId)) return next();
  return res.status(403).json({ error: "Not allowed: can only edit your own profile" });
}

// --- Health / root ---
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) =>
  res.status(200).send("Blond Fury Regatta Tracker API is running. Try /health or /api/regattas")
);

// --- LOGIN ---
// Demo rules:
// - admin logs in with ADMIN_EMAIL + ADMIN_PASSWORD
// - crew logs in with an email that exists in crew_members collection, and uses password "crew"
app.post("/api/login", async (req, res) => {
  if (!requireDb(res)) return;
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const normalizedEmail = String(email).trim().toLowerCase();

  // Admin login
  if (normalizedEmail === String(ADMIN_EMAIL).trim().toLowerCase()) {
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid credentials" });

    const user = { role: "admin", email: normalizedEmail };
    const token = signToken(user);
    return res.json({ token, user });
  }

  // Crew login (demo)
  if (password !== "crew") {
    return res.status(401).json({ error: "Invalid credentials (crew demo password is 'crew')" });
  }

  // find crew member by email field
  const crew = await db.collection("crew_members").findOne({ email: normalizedEmail });
  if (!crew) return res.status(401).json({ error: "No crew member found for that email" });

  const user = { role: "crew", email: normalizedEmail, crewMemberId: String(crew._id) };
  const token = signToken(user);
  return res.json({ token, user });
});

// --- REGATTAS ---
// Read allowed for logged-in users
app.get("/api/regattas", authRequired, async (req, res) => {
  if (!requireDb(res)) return;
  const regattas = await db.collection("regattas").find().toArray();
  res.json(regattas);
});

// Write admin only
app.post("/api/regattas", authRequired, adminOnly, async (req, res) => {
  if (!requireDb(res)) return;
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: "name is required" });
  if (!Array.isArray(payload.assignments)) payload.assignments = [];
  const result = await db.collection("regattas").insertOne(payload);
  const created = await db.collection("regattas").findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

app.put("/api/regattas/:id", authRequired, adminOnly, async (req, res) => {
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

// --- CREW ---
// Read allowed for logged-in users
app.get("/api/crew-members", authRequired, async (req, res) => {
  if (!requireDb(res)) return;
  const crew = await db.collection("crew_members").find().toArray();
  res.json(crew);
});

// Create crew: admin only
app.post("/api/crew-members", authRequired, adminOnly, async (req, res) => {
  if (!requireDb(res)) return;
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: "name is required" });

  // normalize email if present
  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();

  const result = await db.collection("crew_members").insertOne(payload);
  const created = await db.collection("crew_members").findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// Update crew: admin OR self
app.put("/api/crew-members/:id", authRequired, adminOrSelfCrew, async (req, res) => {
  if (!requireDb(res)) return;
  const oid = toObjectId(req.params.id, res);
  if (!oid) return;
  const payload = req.body || {};
  delete payload._id;

  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();

  const r = await db.collection("crew_members").updateOne({ _id: oid }, { $set: payload });
  if (!r.matchedCount) return res.status(404).json({ error: "not found" });
  const updated = await db.collection("crew_members").findOne({ _id: oid });
  res.json(updated);
});

app.listen(PORT, () => console.log(`Regatta API listening on port ${PORT}`));