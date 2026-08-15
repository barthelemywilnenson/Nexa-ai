// Backend Nexa AI — proxy sécurisé vers l'API Gemini (Google)
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("ERREUR: la variable GEMINI_API_KEY n'est pas définie");
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const usage = new Map();
const LIMIT_PAR_JOUR = 50;

function checkLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}-${today}`;
  const count = usage.get(key) || 0;
  if (count >= LIMIT_PAR_JOUR) return false;
  usage.set(key, count + 1);
  return true;
}

app.post('/api/chat', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!checkLimit(ip)) {
    return res.status(429).json({
      error: "Limite quotidienne atteinte. Revenez demain ou passez à un abonnement."
    });
  }

  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Le champ 'messages' est requis." });
  }

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur API Gemini:", errText);
      return res.status(502).json({ error: "Erreur lors de la communication avec le service AI." });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
      || "Désolé, aucune réponse n'a pu être générée.";

    res.json({ reply });
  } catch (err) {
    console.error("Erreur serveur:", err);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Serveur Nexa AI démarré sur le port ${PORT}`);
});
