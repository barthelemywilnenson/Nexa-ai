// Backend Nexa AI — proxy sécurisé vers l'API Anthropic
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error("ERREUR: la variable ANTHROPIC_API_KEY n'est pas définie dans le fichier .env");
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

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur API Anthropic:", errText);
      return res.status(502).json({ error: "Erreur lors de la communication avec le service AI." });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const reply = textBlock ? textBlock.text : "Désolé, aucune réponse n'a pu être générée.";

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
