
// Minimal Express API to forward New Hire emails via Brevo (Sendinblue)
import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static('public'));

const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin, methods: ['POST','GET'], allowedHeaders: ['Content-Type','Authorization'] }));

// Health & helpful message for accidental visits
app.get('/', (_req, res) => {
  res.type('text/plain').send('New Hire API up. POST /api/newhire-email to send email.');
});
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/newhire-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body || {};
    if (!to || !subject || !html) return res.status(400).json({ error: 'Missing to/subject/html' });

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server not configured (missing BREVO_API_KEY)' });

    const senderEmail = process.env.SENDER_EMAIL || 'tcrownover@concentra.com';
    const senderName  = process.env.SENDER_NAME || 'Concentra HR New Hire';

const r = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    accept: "application/json",
    "api-key": apiKey,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    sender: { 
      name: senderName, 
      email: "no-reply@brevo.com" // FIX
    },
    replyTo: {
      email: senderEmail // So replies still go to you
    },
    to: [{ email: to }],
    subject,
    htmlContent: html
  })
});

    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    return res.status(200).send(text);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`New Hire API listening on ${port}`));