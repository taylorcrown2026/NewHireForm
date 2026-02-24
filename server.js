// Minimal Express API to forward New Hire emails via Brevo (Sendinblue) Transactional API
// Keep your BREVO_API_KEY in Render environment variables (never in client-side JS).

import express from 'express';
import cors from 'cors';

// If your Node runtime is < 18, uncomment the next line and add node-fetch to package.json
// import fetch from 'node-fetch';

const app = express();
app.use(express.json({ limit: '200kb' }));

// Restrict CORS to your static site's origin (set CORS_ORIGIN in Render)
const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type']
}));

// Health check
app.get('/', (_req, res) => res.send('New Hire API up'));

// Main endpoint
app.post('/api/newhire-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body || {};
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing to/subject/html' });
    }

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || 'no-reply@yourdomain.com';
    const senderName  = process.env.SENDER_NAME  || 'Concentra HR New Hire';
    if (!apiKey) {
      return res.status(500).json({ error: 'Server not configured (missing BREVO_API_KEY)' });
    }

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html
      })
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).send(text);
    }

    return res.status(200).send(text);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`New Hire API listening on ${port}`));
