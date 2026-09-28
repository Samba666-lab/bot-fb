import express from "express";
const app = express();
app.use(express.json());

const MODEL = "gemini-3.1-flash-lite-preview";

/* ================== ANTONTAN-KEVITRA (ovao eto) ================== */
const WHATSAPP = process.env.WHATSAPP_NUMBER || "034 00 000 00"; // ← laharana WhatsApp marina
const ADRESY = process.env.ADRESY || "Itaosy, Antananarivo";       // ← hamarino
const RAKITRA_APP = "https://srzaitra-api.srzaitra.workers.dev/telecharger";

const SYSTEM = `
Ianao dia mpanampy an'ny pejy Facebook "SR-Zaitra", atelier de couture sy mpivarotra akanjo any Madagasikara.

FITENY
- Valio amin'ny fiteny nampiasain'ny mpanontany (malagasy na frantsay).
- Fohy (fehezanteny 1 ka hatramin'ny 4), mahalala fomba, mafana fo. Emoji iray ihany raha ilaina.

IZAY AMIDIN'NY SR-ZAITRA
- Costume / costard (lehilahy sy vehivavy): amidy vita sy sur mesure.
- Robe sur mesure (fety, mariage, bureau, andavanandro).
- Veste sur mesure.
- Afaka manamboatra karazan'akanjo hafa araka ny sary na modely entin'ny mpanjifa.
- Adiresy: ${ADRESY}.

VIDINY (tena zava-dehibe)
- AZA milaza vidiny mihitsy, na tombana aza, fa miankina amin'ny lamba, ny refy ary ny modely.
- Rehefa manontany vidiny, fotoana (délai), na te hanafatra ny olona, dia omeo foana ny WhatsApp:
  "Mba hahazoana vidiny marina, alefaso amin'ny WhatsApp ${WHATSAPP} ny modely tianao (sary raha misy) sy ny daty ilanao azy."
- Raha mbola tsy fantatra izay ilainy, anontanio fohy: inona no akanjo, ho an'iza, ho amin'ny oviana.

APP SR-ZAITRA (ho an'ny tompon'atelier de couture)
- App Android fitantanana atelier: commande, client, refy, planning, fizarana asa amin'ny mpiasa, journal (vola miditra sy mivoaka, acompte, à encaisser), stock, karaman'ny mpiasa, réveil.
- 2 volana maimaim-poana, avy eo 10 000 Ar isam-bolana. Tsy mila carte bancaire.
- Fampidinana: ${RAKITRA_APP}
- Raha misy olana ara-teknika na fanontaniana lalina momba ny app: WhatsApp ${WHATSAPP}.

FETRA
- Resaka SR-Zaitra, akanjo, couture ary ny app ihany no valianao.
- Raha resaka hafa tanteraka, lazao am-pahalalam-pomba fa tsy afaka manampy amin'izany ianao, ary averino amin'ny akanjo na ny app ny resaka.
- Aza mamorona zavatra tsy voalaza eto (fampihenam-bidy, fandefasana entana, ora fisokafana...). Raha tsy fantatrao: omeo ny WhatsApp.
- Aza mangataka tenimiafina, kaody na vola mihitsy.
`.trim();

/* ======== Fitadidiana resaka (10 hafatra farany, 1 ora) ======== */
const history = new Map(); // userId -> { at, turns: [{role, parts}] }
const MAX_TURNS = 10, TTL = 60 * 60 * 1000;

function getTurns(id) {
  const h = history.get(id);
  if (!h || Date.now() - h.at > TTL) return [];
  return h.turns;
}
function pushTurn(id, role, text) {
  const turns = [...getTurns(id), { role, parts: [{ text }] }].slice(-MAX_TURNS);
  history.set(id, { at: Date.now(), turns });
}

/* ========================== Webhook ========================== */
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN)
    return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  res.sendStatus(200);
  for (const e of req.body.entry || [])
    for (const ev of e.messaging || []) {
      if (!ev.message || ev.message.is_echo) continue;
      const id = ev.sender.id;
      if (ev.message.text) {
        reply(id, ev.message.text).catch(console.error);
      } else if (ev.message.attachments) {
        // sary, feo, sticker...
        send(id,
          `Misaotra tamin'ny sary! 🙏 Mba hahazoana vidiny sy fanazavana amin'ity modely ity, ` +
          `alefaso amin'ny WhatsApp ${WHATSAPP} izy miaraka amin'ny daty ilanao azy.`
        ).catch(console.error);
      }
    }
});

/* ======================= Valin'ny Gemini ======================= */
async function reply(userId, text) {
  typing(userId).catch(() => {});
  pushTurn(userId, "user", text);

  let answer = "";
  try {
    const g = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: getTurns(userId),
          generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
        }),
      }
    );
    const data = await g.json();
    answer = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!answer) console.error("Gemini error:", JSON.stringify(data).slice(0, 500));
  } catch (err) {
    console.error("Gemini fetch error:", err);
  }

  // Tsy aseho ny mpanjifa mihitsy ny erreur ara-teknika
  if (!answer)
    answer = `Miala tsiny, misy olana kely amin'izao fotoana izao. ` +
             `Afaka manoratra aminay amin'ny WhatsApp ${WHATSAPP} ianao. 🙏`;

  pushTurn(userId, "model", answer);
  await send(userId, answer);
}

/* ======================= Messenger API ======================= */
const GRAPH = `https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.PAGE_TOKEN}`;

async function send(userId, text) {
  const r = await fetch(GRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: userId },
      messaging_type: "RESPONSE",
      message: { text: text.slice(0, 1900) }, // fetra 2000 litera
    }),
  });
  if (!r.ok) console.error("Messenger error:", await r.text());
}

async function typing(userId) {
  await fetch(GRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: userId }, sender_action: "typing_on" }),
  });
}

app.listen(process.env.PORT || 3000);
      
