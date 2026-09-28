import express from "express";
const app = express();
app.use(express.json());

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN)
    return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  res.sendStatus(200);
  for (const e of req.body.entry || [])
    for (const ev of e.messaging || [])
      if (ev.message?.text && !ev.message.is_echo)
        reply(ev.sender.id, ev.message.text).catch(console.error);
});

async function reply(userId, text) {
  const g = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "Valio amin'ny teny malagasy, fohy sy mahalala fomba." }],
        },
        contents: [{ parts: [{ text }] }],
      }),
    }
  );
  const data = await g.json();
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Miala tsiny, misy olana kely.";

  await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: userId },
        messaging_type: "RESPONSE",
        message: { text: answer },
      }),
    }
  );
}

app.listen(process.env.PORT || 3000);
