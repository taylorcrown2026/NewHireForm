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

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve absolute paths you’ll reuse
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_FILE = path.join(__dirname, "newhire.db");

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(helmet());

// CORS (lock down via env when deployed)
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ---------- STATIC FILES (keep using /public) ----------
app.use(
  express.static(PUBLIC_DIR, {
    index: false, // we’ll explicitly route / to public/index.html below
    extensions: ["html"], // helps if someone hits /dashboard (without .html)
    fallthrough: true,
  })
);

// ---------- DATABASE ----------
const db = new sqlite3.Database(DB_FILE);

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

// Default admin bootstrap (only if table empty and env present)
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (DEFAULT_ADMIN_EMAIL && DEFAULT_ADMIN_PASSWORD) {
  db.get("SELECT COUNT(1) as c FROM admin", async (err, row) => {
    if (err) console.error(err);
    if (!row || row.c === 0) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
      db.run(
        "INSERT OR IGNORE INTO admin (email, passwordHash) VALUES (?, ?)",
        [DEFAULT_ADMIN_EMAIL, hash],
        () => console.log("Default admin ensured.")
      );
    }
  });
} else {
  console.warn(
    "ADMIN_EMAIL / ADMIN_PASSWORD not set. Create an admin user manually."
  );
}

// Steps catalog (ordered)
export const STEPS = [
  "Not Started - Step 1 of 8",
  "Under Initial Review Status - Step 2 of 8",
  "Under Manager Approval - Step 3 of 8",
  "Equipment Processing - Step 4 of 8",
  "Equipment Out For Delivery - Step 5 of 8",
  "Equipment Delivered- Step 6 of 8",
  "New Hire Set Up Completed - Step 7 of 8",
  "New Hire Completed - Step 8 of 8",
];

// ---------- AUTH ----------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev-secret-change"
    );
    req.admin = decoded;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Rate limit login to reduce brute force
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // max attempts
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- API ROUTES ----------
// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Steps catalog
app.get("/api/steps", (_req, res) => res.json(STEPS));

// Admin login
app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing email/password" });

  db.get("SELECT * FROM admin WHERE email = ?", [email], async (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
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
  // Basic validation
  const required = ["fullName", "personalEmail", "startDate", "jobTitle", "office"];
  for (const k of required) {
    if (!d[k]) return res.status(400).json({ error: `Missing ${k}` });
  }
  db.run(
    `INSERT INTO submissions (
      fullName, personalEmail, startDate, jobTitle, department, manager, office,
      software, equipment, accessories, accessoriesTotal, notes, accessNotes, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(d.accessories || []),
      Number(d.accessoriesTotal || 0),
      d.notes || "",
      d.accessNotes || "",
      new Date().toISOString(),
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB insert error" });
      const submissionId = this.lastID;
      // On create, mark step 1 as complete to reflect placement in queue
      db.run(
        `INSERT OR REPLACE INTO status_updates (submissionId, stepIndex, isComplete)
         VALUES (?, ?, 1)`,
        [submissionId, 1],
        (e2) => {
          if (e2) console.error(e2);
          res.json({ success: true, submissionId });
        }
      );
    }
  );
});

// Dashboard: get a single submission including current statuses
app.get("/api/submission/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  db.get("SELECT * FROM submissions WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!row) return res.status(404).json({ error: "Not found" });

    db.all(
      "SELECT stepIndex, isComplete FROM status_updates WHERE submissionId = ? ORDER BY stepIndex ASC",
      [id],
      (e2, statusRows) => {
        if (e2) return res.status(500).json({ error: "DB error" });
        res.json({ submission: row, steps: STEPS, status: statusRows });
      }
    );
  });
});

// (kept for completeness) Dashboard: get status for a submission
app.get("/api/status/:id", (req, res) => {
  db.all(
    "SELECT stepIndex, isComplete FROM status_updates WHERE submissionId = ? ORDER BY stepIndex ASC",
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

// Admin: list all submissions
app.get("/api/admin/submissions", requireAdmin, (_req, res) => {
  db.all("SELECT * FROM submissions ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// Admin: update a step
app.post("/api/admin/update-status", requireAdmin, (req, res) => {
  const { submissionId, stepIndex, isComplete } = req.body || {};
  if (!submissionId || !stepIndex)
    return res.status(400).json({ error: "Missing submissionId/stepIndex" });
  const val = isComplete ? 1 : 0;
  db.run(
    `INSERT OR REPLACE INTO status_updates (submissionId, stepIndex, isComplete)
     VALUES (?, ?, ?)`,
    [submissionId, stepIndex, val],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    }
  );
});

// ---------- FRONT-END ROUTING (from /public) ----------
// NOTE: these send the files from public/, so you can visit the pretty paths
app.get("/", (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "index.html"))
);
app.get(["/dashboard", "/dashboard.html"], (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "dashboard.html"))
);
app.get(["/admin", "/admin-login", "/admin-login.html"], (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "admin-login.html"))
);
app.get(["/admin-portal", "/admin-portal.html"], (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "admin-portal.html"))
);

// Optional: 404 fallback to a custom page in /public (create public/404.html if desired)
app.use((req, res) => {
  const notFoundPage = path.join(PUBLIC_DIR, "404.html");
  res.status(404).sendFile(notFoundPage, (err) => {
    if (err) res.status(404).send("Not Found");
  });
});

// ---------- START ----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`New Hire Portal listening on :${port}`));