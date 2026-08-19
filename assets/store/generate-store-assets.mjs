import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("assets/store");
const sourceDir = path.join(root, "source");
const outDir = path.join(root, "png");
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const iconData = fs.readFileSync(path.resolve("assets/images/icon-512.png")).toString("base64");

const C = {
  ink: "#24343a",
  muted: "#617277",
  coral: "#f26f72",
  coralDark: "#d85862",
  mint: "#42b9a4",
  sun: "#f6cf67",
  cream: "#fff9f1",
  paper: "#fffdf9",
  line: "#e5dfd7",
  lavender: "#dcd7f2",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (x, y, value, size = 28, weight = 500, fill = C.ink, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;
const titleBlock = (x, y, value, W) => {
  const words = value.split(" ");
  const lines = [];
  let current = "";
  const maxChars = W < 1200 ? 27 : 33;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  const size = lines.length > 1 ? (W < 1200 ? 55 : 62) : (W < 1200 ? 60 : 64);
  return lines.map((lineValue, i) => text(x, y + i * (size + 8), lineValue, size, 700, C.ink)).join("");
};
const rect = (x, y, w, h, fill, r = 22, stroke = "none", sw = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line = (x1, y1, x2, y2, stroke = C.line, sw = 2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
const dot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

function phone(content, W, H) {
  const px = 66, py = 410, pw = W - 132, ph = H - 515;
  return [
    rect(0, 0, W, H, C.cream, 0),
    text(66, 108, "FamilySync", 30, 700, C.coralDark),
    titleBlock(66, 190, content.title, W),
    text(66, content.title.length > 27 ? 316 : 248, content.subtitle, 28, 400, C.muted),
    rect(px, py, pw, ph, "#26383d", 52),
    rect(px + 14, py + 14, pw - 28, ph - 28, C.paper, 40),
    rect(px + pw / 2 - 54, py + 23, 108, 16, "#26383d", 10),
    content.body(px + 42, py + 82, pw - 84, ph - 115),
    rect(px + pw / 2 - 38, py + ph - 42, 76, 7, "#c9d0cd", 4),
    text(W - 66, H - 72, content.index, 22, 700, C.coralDark, "end"),
  ].join("");
}

function nav(x, y, w, active) {
  const items = ["Home", "Calendario", "Spesa", "Faccende", "Chat", "Famiglia"];
  return items.map((item, i) => {
    const xx = x + i * (w / (items.length - 1));
    const on = item === active;
    return `${dot(xx, y, 9, on ? C.coral : "#c8d1cd")}${text(xx, y + 30, item, 14, on ? 700 : 500, on ? C.coralDark : C.muted, "middle")}`;
  }).join("");
}
function card(x, y, w, h, title, meta, accent = C.mint) {
  return `${rect(x, y, w, h, C.paper, 18, C.line, 2)}${rect(x, y, 9, h, accent, 5)}${text(x + 28, y + 42, title, 25, 700)}${text(x + 28, y + 76, meta, 17, 500, C.muted)}`;
}

const screens = [
  {
    slug: "01-home",
    title: "Tutto al posto giusto.",
    subtitle: "La giornata della Famiglia Bianchi, senza rincorse.",
    index: "01 / 08",
    active: "Home",
    body: (x, y, w, h) => [
      text(x, y, "Bentornata famiglia", 17, 500, C.muted),
      text(x, y + 42, "Famiglia Bianchi", 31, 700),
      text(x, y + 82, "4 membri", 18, 500, C.muted),
      text(x, y + 138, "In arrivo", 22, 700),
      card(x, y + 160, w, 96, "Colloquio di Emma", "Oggi · 16:30 · Sara", C.sun),
      card(x, y + 270, w, 96, "Allenamento di Tommaso", "Domani · 17:00 · Luca", C.coral),
      text(x, y + 430, "Faccende da fare", 22, 700),
      card(x, y + 452, w, 84, "Stendere il bucato", "Emma · 10 punti", C.mint),
      nav(x + 24, y + h - 42, w - 48, "Home"),
    ].join(""),
  },
  {
    slug: "02-calendario",
    title: "Una settimana chiara.",
    subtitle: "Impegni, scuola e tempo insieme nello stesso posto.",
    index: "02 / 08",
    active: "Calendario",
    body: (x, y, w, h) => {
      const days = ["L", "M", "M", "G", "V", "S", "D"];
      return [
        text(x, y, "Calendario", 31, 700), text(x + w, y, "＋", 37, 400, C.coralDark, "end"),
        rect(x, y + 28, w, 300, C.paper, 18, C.line, 2),
          text(x + w / 2, y + 72, "Settembre 2026", 22, 700, C.ink, "middle"),
        days.map((d, i) => text(x + 26 + i * ((w - 52) / 6), y + 120, d, 15, 700, C.muted, "middle")).join(""),
        Array.from({ length: 35 }, (_, i) => {
          const cx = x + 26 + (i % 7) * ((w - 52) / 6), cy = y + 163 + Math.floor(i / 7) * 38;
          const selected = i === 14;
          return `${selected ? dot(cx, cy - 5, 20, C.coral) : ""}${text(cx, cy, String(i + 1), 15, selected ? 700 : 500, selected ? "#fff" : C.ink, "middle")}${[7, 14, 20].includes(i) ? dot(cx, cy + 13, 3.5, C.mint) : ""}`;
        }).join(""),
        text(x, y + 372, "Eventi del 15 settembre", 22, 700),
        card(x, y + 392, w, 86, "Colloquio di Emma", "16:30 · Scuola primaria", C.sun),
        nav(x + 24, y + h - 42, w - 48, "Calendario"),
      ].join("");
    },
  },
  {
    slug: "03-spesa",
    title: "La spesa, già condivisa.",
    subtitle: "Una lista viva: chi compra vede subito cosa manca.",
    index: "03 / 08",
    active: "Spesa",
    body: (x, y, w, h) => [
      text(x, y, "Spesa", 31, 700), text(x + w, y, "＋", 37, 400, C.coralDark, "end"),
      rect(x, y + 30, w, 70, C.mint, 18),
      text(x + 24, y + 74, "Spesa settimanale", 22, 700, "#fff"),
      text(x + w - 24, y + 74, "5 / 8", 18, 700, "#fff", "end"),
      line(x + 24, y + 120, x + w - 24, y + 120, C.line, 8),
      line(x + 24, y + 120, x + w * 0.63, y + 120, C.sun, 8),
      text(x, y + 178, "Da comprare", 22, 700),
      ["Pane integrale · Luca", "Yogurt bianco · Sara", "Pomodori · Emma"].map((v, i) =>
        `${rect(x, y + 202 + i * 64, w, 48, C.paper, 15, C.line, 2)}${rect(x + 16, y + 216 + i * 64, 20, 20, "none", 6, C.mint, 2)}${text(x + 54, y + 238 + i * 64, v, 18, 500)}`
      ).join(""),
      text(x, y + 430, "Già in carrello", 22, 700),
      `${text(x, y + 470, "Latte · 2", 18, 500, C.muted)}${text(x + w, y + 470, "Completato", 16, 700, C.mint, "end")}`,
      nav(x + 24, y + h - 42, w - 48, "Spesa"),
    ].join(""),
  },
  {
    slug: "04-faccende",
    title: "Ognuno fa la sua parte.",
    subtitle: "Piccoli compiti, punti visibili, più tempo per stare insieme.",
    index: "04 / 08",
    active: "Faccende",
    body: (x, y, w, h) => [
      text(x, y, "Faccende", 31, 700), text(x + w, y, "＋", 37, 400, C.coralDark, "end"),
      rect(x, y + 32, 86, 40, C.coral, 20), text(x + 43, y + 58, "Da fare", 16, 700, "#fff", "middle"),
      rect(x + 98, y + 32, 70, 40, C.paper, 20, C.line, 2), text(x + 133, y + 58, "Fatte", 16, 500, C.ink, "middle"),
      card(x, y + 100, w, 104, "Apparecchiare la tavola", "Tommaso · Oggi · 15 punti", C.sun),
      card(x, y + 220, w, 104, "Riordinare il salotto", "Emma · Oggi · 10 punti", C.mint),
      text(x, y + 360, "Classifica della settimana", 22, 700),
      `${text(x, y + 426, "1  Sara Bianchi", 18, 600)}${text(x + w, y + 426, "35 punti", 17, 700, C.coralDark, "end")}`,
      `${text(x, y + 464, "2  Emma Bianchi", 18, 600)}${text(x + w, y + 464, "25 punti", 17, 700, C.coralDark, "end")}`,
      rect(x, y + 500, w, 76, C.lavender, 16),
      text(x + 20, y + 530, "Premi da riscattare", 17, 700),
      text(x + 20, y + 558, "Serata film scelta dai bambini", 15, 500, C.muted),
      text(x + w - 20, y + 546, "40 punti", 16, 700, C.coralDark, "end"),
      nav(x + 24, y + h - 42, w - 48, "Faccende"),
    ].join(""),
  },
  {
    slug: "05-piano-pasti-ai",
    title: "A tavola, senza pensarci troppo.",
    subtitle: "L’AI propone il piano. La famiglia lo adatta.",
    index: "05 / 08",
    active: "Home",
    body: (x, y, w, h) => [
      text(x, y, "Piano pasti", 31, 700), rect(x + w - 122, y - 26, 122, 36, C.lavender, 18),
      text(x + w - 61, y - 2, "AI", 16, 700, C.ink, "middle"),
      text(x, y + 66, "Settimana del 21 settembre", 18, 600, C.muted),
      card(x, y + 92, w, 94, "Lunedì · Pasta al forno", "Cena · 4 porzioni", C.coral),
      card(x, y + 202, w, 94, "Martedì · Frittata e verdure", "Cena · 4 porzioni", C.sun),
      card(x, y + 312, w, 94, "Mercoledì · Cous cous mediterraneo", "Cena · 4 porzioni", C.mint),
      rect(x, y + 436, w, 52, C.coral, 18), text(x + w / 2, y + 469, "Genera un’alternativa", 17, 700, "#fff", "middle"),
      nav(x + 24, y + h - 42, w - 48, "Home"),
    ].join(""),
  },
  {
    slug: "06-dispensa-ricette",
    title: "Dal frigo alla tavola.",
    subtitle: "Dispensa e ricette parlano tra loro, ogni giorno.",
    index: "06 / 08",
    active: "Spesa",
    body: (x, y, w, h) => [
      text(x, y, "Dispensa", 31, 700), text(x + w, y, "＋", 37, 400, C.coralDark, "end"),
      rect(x, y + 32, w, 66, C.sun, 18), text(x + 22, y + 72, "2 prodotti in scadenza", 19, 700, C.ink),
      text(x, y + 150, "In casa", 22, 700),
      ["Passata di pomodoro", "Uova · 6", "Riso basmati · 500 g"].map((v, i) =>
        `${rect(x, y + 174 + i * 57, w, 43, C.paper, 13, C.line, 2)}${text(x + 20, y + 202 + i * 57, v, 17, 500)}`
      ).join(""),
      text(x, y + 376, "Ricette della famiglia", 22, 700),
      card(x, y + 398, w, 82, "Parmigiana veloce", "Passata, melanzane, mozzarella", C.coral),
      nav(x + 24, y + h - 42, w - 48, "Spesa"),
    ].join(""),
  },
  {
    slug: "07-budget",
    title: "Il budget, con serenità.",
    subtitle: "Numeri leggibili per decidere insieme, senza sorprese.",
    index: "07 / 08",
    active: "Home",
    body: (x, y, w, h) => [
      text(x, y, "Budget familiare", 31, 700),
      rect(x, y + 38, w, 150, C.ink, 20),
      text(x + 24, y + 80, "Spese di settembre", 17, 500, "#b9c5c1"),
      text(x + 24, y + 132, "€ 842,60", 37, 700, "#fff"),
      text(x + w - 24, y + 132, "su € 1.200", 17, 500, "#b9c5c1", "end"),
      line(x + 24, y + 162, x + w - 24, y + 162, "#53686b", 8),
      line(x + 24, y + 162, x + w * 0.72, y + 162, C.sun, 8),
      text(x, y + 240, "Per categoria", 22, 700),
      [["Spesa", "€ 326,40", C.mint], ["Casa", "€ 188,20", C.coral], ["Trasporti", "€ 97,00", C.sun]].map((a, i) =>
        `${text(x, y + 284 + i * 55, a[0], 18, 600)}${text(x + w, y + 284 + i * 55, a[1], 18, 700, C.ink, "end")}${line(x, y + 300 + i * 55, x + w * (0.6 - i * 0.12), y + 300 + i * 55, a[2], 7)}`
      ).join(""),
      rect(x, y + 430, w, 52, C.lavender, 18), text(x + w / 2, y + 463, "Analizza con AI", 17, 700, C.ink, "middle"),
      rect(x, y + 500, w, 74, C.paper, 16, C.line, 2),
      text(x + 20, y + 528, "Bolletta luce", 17, 700),
      text(x + 20, y + 555, "Scadenza 30 settembre · € 68,40", 15, 500, C.muted),
      nav(x + 24, y + h - 42, w - 48, "Home"),
    ].join(""),
  },
  {
    slug: "08-chat-famiglia",
    title: "Sempre dalla stessa parte.",
    subtitle: "Chat privata e profili della famiglia, insieme.",
    index: "08 / 08",
    active: "Chat",
    body: (x, y, w, h) => [
      // Due crop separati: bordi e header distinti evitano l'interpretazione
      // di una singola pagina scrollabile.
      rect(x, y, w, 228, "#f8faf8", 18, C.line, 2),
      rect(x, y, w, 46, C.coral, 18),
      text(x + 22, y + 30, "Chat", 20, 700, "#fff"),
      text(x + w - 22, y + 30, "Famiglia Bianchi", 15, 600, "#fff", "end"),
      rect(x + 22, y + 70, w - 22, 48, C.coral, 15),
      text(x + 42, y + 100, "Stasera cena alle 19:30?", 16, 600, "#fff"),
      rect(x, y + 132, w - 72, 48, "#e9efec", 15),
      text(x + 20, y + 162, "Sì, preparo io la tavola.", 16, 600),
      text(x + w - 22, y + 204, "Scrivi un messaggio...", 14, 500, C.muted, "end"),
      rect(x, y + 254, w, 286, "#f3f7f4", 18, C.line, 2),
      rect(x, y + 254, w, 46, C.mint, 18),
      text(x + 22, y + 284, "Famiglia", 20, 700, "#fff"),
      text(x + w - 22, y + 284, "Gestione profili", 15, 600, "#fff", "end"),
      text(x + 22, y + 338, "Profili bambini", 17, 700),
      rect(x + 22, y + 358, w - 44, 58, C.paper, 14, C.line, 2),
      dot(x + 48, y + 387, 16, C.sun), text(x + 76, y + 393, "Emma Bianchi", 16, 700),
      text(x + w - 22, y + 393, "Modifica", 14, 600, C.coralDark, "end"),
      rect(x + 22, y + 428, w - 44, 58, C.paper, 14, C.line, 2),
      dot(x + 48, y + 457, 16, C.mint), text(x + 76, y + 463, "Tommaso Bianchi", 16, 700),
      text(x + w - 22, y + 463, "Codice", 14, 600, C.coralDark, "end"),
      nav(x + 24, y + h - 42, w - 48, "Chat"),
    ].join(""),
  },
];

function svgFor(screen, W, H) {
  const content = phone(screen, W, H);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${content}</svg>`;
}

function featureSvg() {
  const W = 1024, H = 500;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${rect(0, 0, W, H, C.cream, 0)}
    ${dot(835, 100, 150, "#fce2d9")}${dot(908, 404, 110, "#dff2ed")}
    ${rect(72, 72, 58, 58, C.paper, 16)}
    <image x="78" y="78" width="46" height="46" href="data:image/png;base64,${iconData}" preserveAspectRatio="xMidYMid slice"/>
    ${text(146, 113, "FamilySync", 34, 700, C.coralDark)}
    ${text(72, 236, "Meno caos.", 68, 700, C.ink)}
    ${text(72, 312, "Più famiglia.", 68, 700, C.ink)}
    ${text(74, 370, "Calendario, spesa, faccende e conversazioni.", 23, 500, C.muted)}
    ${rect(710, 54, 190, 392, C.ink, 38)}
    ${rect(722, 66, 166, 368, C.paper, 28)}
    ${rect(770, 76, 70, 10, C.ink, 5)}
    ${text(740, 132, "Famiglia", 20, 700)}
    ${rect(740, 154, 130, 54, C.mint, 14)}${text(754, 187, "Oggi insieme", 15, 700, "#fff")}
    ${rect(740, 224, 130, 54, C.sun, 14)}${text(754, 257, "Lista spesa", 15, 700)}
    ${rect(740, 294, 130, 54, C.coral, 14)}${text(754, 327, "Chat privata", 15, 700, "#fff")}
    ${text(812, 474, "Famiglia Bianchi", 16, 600, C.coralDark, "middle")}
  </svg>`;
}

for (const screen of screens) {
  const svg = svgFor(screen, 1080, 1920);
  fs.writeFileSync(path.join(sourceDir, `${screen.slug}.svg`), svg);
  const appleSvg = svgFor(screen, 1290, 2796);
  fs.writeFileSync(path.join(sourceDir, `${screen.slug}-apple.svg`), appleSvg);
  await sharp(Buffer.from(svg)).flatten({ background: C.cream }).png().toFile(path.join(outDir, `google-${screen.slug}.png`));
  await sharp(Buffer.from(appleSvg)).flatten({ background: C.cream }).png().toFile(path.join(outDir, `apple-${screen.slug}.png`));
  // Keep root-level filenames usable by existing upload tooling without
  // assigning a feature to a misleading filename.
  const aliases = [
    ["home"],
    ["calendar"],
    ["shopping"],
    ["chores"],
    ["ai"],
    ["pantry"],
    ["budget"],
    ["chat", "family"],
  ][screens.indexOf(screen)];
  for (const alias of aliases) {
    await sharp(Buffer.from(svg)).flatten({ background: C.cream }).png().toFile(path.join(root, `screenshot-${alias}.png`));
    await sharp(Buffer.from(appleSvg)).flatten({ background: C.cream }).png().toFile(path.join(root, `screenshot-${alias}-apple.png`));
  }
}
fs.writeFileSync(path.join(sourceDir, "feature-graphic.svg"), featureSvg());
await sharp(Buffer.from(featureSvg())).flatten({ background: C.cream }).png().toFile(path.join(outDir, "google-feature-graphic.png"));
await sharp(Buffer.from(featureSvg())).flatten({ background: C.cream }).png().toFile(path.join(root, "feature-graphic.png"));