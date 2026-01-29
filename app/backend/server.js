const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json());

// --- CORS (do this early) ---
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

// --- API KEY GATE ---
const API_KEY = process.env.API_KEY;
const API_KEY_HEADER = "regatta-api-key";

function requireApiKey(req, res, next) {
  // Only apply to /api/*
  if (!req.path.startsWith("/api/")) return next();

  // ✅ Allow login without API key
  if (req.path === "/api/login") return next();

  if (!API_KEY) {
    console.error("Missing API_KEY env var");
    return res.status(500).json({ error: "Server misconfigured (API_KEY missing)" });
  }

  const provided = req.get(API_KEY_HEADER);
  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  return next();
}

  const provided = req.get(API_KEY_HEADER);
  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  return next();
}

// IMPORTANT: this must be BEFORE your /api routes
app.use(requireApiKey);

// --- ENV ---
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "wiz-exercise-dev-secret";

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
    db = client.db();
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

// --- AUTH / RBAC ---
function signToken(user) {
  return jwt.sign(
    { role: user.role, email: user.email, crewMemberId: user.crewMemberId || null },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const [scheme, token] = h.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

function adminOrSelfCrew(req, res, next) {
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

// --- LOGIN (API key REQUIRED unless you exempted above) ---
app.post("/api/login", async (req, res) => {
  if (!requireDb(res)) return;
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const normalizedEmail = String(email).trim().toLowerCase();

  // Admin login
  if (normalizedEmail === String(ADMIN_EMAIL).trim().toLowerCase()) {
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid credentials" });
    const user = { role: "admin", email: normalizedEmail };
    return res.json({ token: signToken(user), user });
  }

  // Crew login (demo password)
  if (password !== "crew") {
    return res.status(401).json({ error: "Invalid credentials (crew demo password is 'crew')" });
  }

  const crew = await db.collection("crew_members").findOne({ email: normalizedEmail });
  if (!crew) return res.status(401).json({ error: "No crew member found for that email" });

  const user = { role: "crew", email: normalizedEmail, crewMemberId: String(crew._id) };
  return res.json({ token: signToken(user), user });
});

// --- REGATTAS (READ = API KEY only) ---
app.get("/api/regattas", async (req, res) => {
  if (!requireDb(res)) return;
  const regattas = await db.collection("regattas").find().toArray();
  res.json(regattas);
});

// --- REGATTAS (WRITE = JWT + admin) ---
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

// --- CREW (READ = API KEY only) ---
app.get("/api/crew-members", async (req, res) => {
  if (!requireDb(res)) return;
  const crew = await db.collection("crew_members").find().toArray();
  res.json(crew);
});

// --- CREW (WRITE = JWT; create=admin, update=admin or self) ---
app.post("/api/crew-members", authRequired, adminOnly, async (req, res) => {
  if (!requireDb(res)) return;
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: "name is required" });
  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();

  const result = await db.collection("crew_members").insertOne(payload);
  const created = await db.collection("crew_members").findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

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