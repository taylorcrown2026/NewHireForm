import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", 'data:'],
      // Allow inline scripts because pages use inline <script> blocks
      "script-src": ["'self'", "'unsafe-inline'"],
      // Allow Google Fonts CSS
      "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      // Allow Google Fonts font files
      "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"]
    }
  },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: true,
  noSniff: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'change-this-in-prod'));

const PUBLIC_DIR = path.join(__dirname, 'public');
const LOGIN_PAGE = path.join(PUBLIC_DIR, 'login.html');
const FORM_PAGE = path.join(PUBLIC_DIR, 'index.html');

const PASSWORD_HASH = process.env.FORM_PASSWORD_HASH || '';
if (!PASSWORD_HASH) {
  console.warn('\n[WARN] FORM_PASSWORD_HASH not set.');
}

const authLimiter = rateLimit({ windowMs: 5*60*1000, max: 20, standardHeaders: true, legacyHeaders: false });

function authed(req) { return req.signedCookies?.auth === 'ok'; }
function requireAuth(req, res, next) { if (!authed(req)) return res.redirect('/login'); next(); }

app.get('/login', (req, res) => res.sendFile(LOGIN_PAGE));
app.post('/login', authLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ ok: false, error: 'Missing password' });
    if (!PASSWORD_HASH) return res.status(500).json({ ok: false, error: 'Server not configured' });
    const ok = await bcrypt.compare(password, PASSWORD_HASH);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid password' });
    res.cookie('auth', 'ok', { httpOnly: true, sameSite: 'lax', secure: !!process.env.COOKIE_SECURE, signed: true, maxAge: 8*60*60*1000 });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});
app.post('/logout', (req, res) => { res.clearCookie('auth'); res.redirect('/login'); });

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));
app.use('/login-assets', express.static(path.join(PUBLIC_DIR, 'login-assets')));

app.get('/', requireAuth, (req, res) => res.sendFile(FORM_PAGE));
app.get(['/index.html','/form'], requireAuth, (req, res) => res.sendFile(FORM_PAGE));

app.get('*', (req, res) => { if (authed(req)) return res.redirect('/'); return res.redirect('/login'); });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`New Hire Form (protected) listening on :${port}`));