import express from "express";
import cors from "cors";
import helmet from "helmet";
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(helmet());

// ===== STATIC FILES MUST COME FROM ROOT FOLDER =====
app.use(express.static(__dirname));

// ===== CORS =====
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ===== DATABASE =====
const db = new sqlite3.Database(path.join(__dirname, "newhire.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT,
      personalEmail TEXT,
      startDate TEXT,
      jobTitle TEXT,
      department TEXT,
      manager TEXT,
      office TEXT,
      software TEXT,
      equipment TEXT,
      accessories TEXT,
      accessoriesTotal REAL,
      notes TEXT,
      accessNotes TEXT,
      createdAt TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      passwordHash TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS status_updates (
      submissionId INTEGER NOT NULL,
      stepIndex INTEGER NOT NULL,
      isComplete INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (submissionId, stepIndex),
      FOREIGN KEY (submissionId) REFERENCES submissions(id)
    );
  `);
});

// Default admin
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (DEFAULT_ADMIN_EMAIL && DEFAULT_ADMIN_PASSWORD) {
  db.get("SELECT COUNT(1) as c FROM admin", async (err, row) => {
    if (!row || row.c === 0) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
      db.run(
        "INSERT OR IGNORE INTO admin (email, passwordHash) VALUES (?, ?)",
        [DEFAULT_ADMIN_EMAIL, hash]
      );
    }
  });
}

// Steps
export const STEPS = [
  "Not Started - Step 1 of 8",
  "Under Initial Review Status - Step 2 of 8",
  "Under Manager Approval - Step 3 of 8",
  "Equipment Processing - Step 4 of 8",
  "Equipment Out For Delivery - Step 5 of 8",
  "Equipment Delivered- Step 6 of 8",
  "New Hire Set Up Completed - Step 7 of 8",
  "New Hire Completed - Step 8 of 8"
];

// AUTH
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change");
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
});

// ROUTES
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/steps", (_req, res) => res.json(STEPS));

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email/password" });

  db.get("SELECT * FROM admin WHERE email = ?", [email], async (err, row) => {
    if (!row) return res.status(401).json({ error: "Invalid login" });

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid login" });

    const token = jwt.sign(
      { id: row.id, email: row.email },
      process.env.JWT_SECRET || "dev-secret-change",
      { expiresIn: "8h" }
    );

    res.json({ token });
  });
});

// Submit new hire
app.post("/api/submit", (req, res) => {
  const d = req.body || {};
  const required = ["fullName", "personalEmail", "startDate", "jobTitle", "office"];
  for (const k of required) {
    if (!d[k]) return res.status(400).json({ error: `Missing ${k}` });
  }

  db.run(
    `INSERT INTO submissions
    (fullName, personalEmail, startDate, jobTitle, department,
     manager, office, software, equipment, accessories, accessoriesTotal,
     notes, accessNotes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.fullName,
      d.personalEmail,
      d.startDate,
      d.jobTitle,
      d.department || "",
      d.manager || "",
      d.office,
      JSON.stringify(d.software || []),
      JSON.stringify(d.equipment || []),
      JSON.stringify([]),
      0,
      d.notes || "",
      d.accessNotes || "",
      new Date().toISOString(),
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB insert error" });

      const submissionId = this.lastID;

      db.run(
        `INSERT INTO status_updates (submissionId, stepIndex, isComplete)
         VALUES (?, ?, 1)`,
        [submissionId, 1]
      );

      res.json({ success: true, submissionId });
    }
  );
});

// Admin: list
app.get("/api/admin/submissions", requireAdmin, (_req, res) => {
  db.all("SELECT * FROM submissions ORDER BY id DESC", [], (err, rows) => {
    res.json(rows);
  });
});

// Admin: update step
app.post("/api/admin/update-status", requireAdmin, (req, res) => {
  const { submissionId, stepIndex, isComplete } = req.body;
  db.run(
    `INSERT OR REPLACE INTO status_updates (submissionId, stepIndex, isComplete)
     VALUES (?, ?, ?)`,
    [submissionId, stepIndex, isComplete ? 1 : 0]
  );
  res.json({ success: true });
});

// Frontend routes
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/admin-login", (_req, res) => res.sendFile(path.join(__dirname, "admin-login.html")));
app.get("/admin-portal", (_req, res) => res.sendFile(path.join(__dirname, "admin-portal.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));