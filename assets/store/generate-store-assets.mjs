import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/*
  FamilySync store campaign — "La casa in movimento"
  Editorial family photography meets the actual, uncropped product interface.
  Nothing inside a device is recreated: every device image is a supplied capture.
*/
const root = path.resolve("assets/store");
const out = path.join(root, "png");
const captures = path.join(root, "captures");
const images = path.resolve("assets/images");
fs.mkdirSync(out, { recursive: true });
for (const obsoleteDir of ["source", "tablet-7", "tablet-10"]) {
  fs.rmSync(path.join(root, obsoleteDir), { recursive: true, force: true });
}
for (const obsoleteFile of fs.readdirSync(root)) {
  if (/^screenshot-.*\.png$/i.test(obsoleteFile) || obsoleteFile === "feature-graphic.png") {
    fs.rmSync(path.join(root, obsoleteFile), { force: true });
  }
}

const C = { ink: "#1c3030", cream: "#f7f0e4", coral: "#fa695e", teal: "#1da99a", sun: "#f5c850", paper: "#fffaf2", sage: "#dce6d8", rose: "#f2c4b6" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const txt = (x, y, value, size, weight = 700, fill = C.ink, anchor = "start", family = "DejaVu Sans") =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;
const wrapLines = (value, size, max) => {
  const limit = Math.max(11, Math.floor(max / (size * .56)));
  const words = value.split(" "); const lines = []; let current = "";
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (next.length > limit && current) { lines.push(current); current = word; } else current = next; }
  lines.push(current);
  return lines;
};
const wrap = (x, y, value, size, max, line = 1.02, fill = C.ink) =>
  wrapLines(value, size, max).map((v, i) => txt(x, y + i * size * line, v, size, 800, fill)).join("");
const round = (x, y, w, h, r, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const crop = async (input, w, h, position = "centre") => sharp(input).resize(w, h, { fit: "cover", position }).jpeg({ quality: 92 }).toBuffer();
const layer = async (input, left, top) => ({ input, left, top });

const slides = [
  { slug: "01-home", capture: "home", photo: "photo-family-planning.jpg", pos: "left", kicker: "LA REGIA DELLA GIORNATA", title: "Non tenere tutto in testa.", sub: "Impegni, cose da fare e messaggi. Tutti nello stesso posto.", color: C.coral, layout: "hero" },
  { slug: "02-calendario", capture: "calendar", photo: "photo-family-planning.jpg", pos: "left", kicker: "CALENDARIO CONDIVISO", title: "Chi porta chi, e quando?", sub: "La risposta è già nel calendario di famiglia.", color: C.teal, layout: "split" },
  { slug: "03-spesa", capture: "shopping", photo: "photo-family-cooking.jpg", pos: "left", kicker: "SPESA CONDIVISA", title: "La lista non resta sul frigo.", sub: "Aggiungi una cosa. Chi passa al supermercato la vede.", color: C.sun, layout: "photoTop" },
  { slug: "04-faccende", capture: "chores", secondary: "rewards", photo: "photo-family-together.jpg", pos: "right", kicker: "FACCENDE E PREMI", title: "Meno solleciti. Più collaborazione.", sub: "Compiti chiari, punti e piccoli traguardi per tutti.", color: C.coral, layout: "side" },
  { slug: "05-piano-pasti-ai", capture: "meal-plan", photo: "photo-family-cooking.jpg", pos: "left", kicker: "PIANO PASTI AI", title: "La domanda “cosa mangiamo?” finisce qui.", sub: "Il menu della settimana parte da ciò che piace davvero a casa.", color: C.teal, layout: "split" },
  { slug: "06-dispensa-ricette", capture: "recipes", secondary: "pantry", photo: "photo-family-cooking.jpg", pos: "left", kicker: "RICETTE E DISPENSA", title: "Apri il frigo. Trova un'idea.", sub: "Ricette salvate e ingredienti sempre a portata di mano.", color: C.sun, layout: "photoTop" },
  { slug: "07-budget", capture: "budget", secondary: "bills", photo: "photo-family-together.jpg", pos: "right", kicker: "BUDGET E BOLLETTE", title: "I conti di casa, senza caccia al foglio.", sub: "Spese e scadenze leggibili da chi condivide la vita.", color: C.coral, layout: "side" },
  { slug: "08-chat-famiglia", capture: "chat", secondary: "family", photo: "photo-family-together.jpg", pos: "right", kicker: "CHAT E FAMIGLIA", title: "La chat che sa di casa.", sub: "Messaggi, ruoli e persone: il vostro spazio privato.", color: C.teal, layout: "hero" },
];

async function phoneCard(file, w, h, accent) {
  const src = path.join(captures, file);
  const capture = await sharp(src).resize(w - 28, h - 28, { fit: "cover", position: "top" }).png().toBuffer();
  const frame = svg(w, h, `<defs><filter id="s"><feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#18312e" flood-opacity=".24"/></filter><clipPath id="c"><rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="42"/></clipPath></defs><rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="51" fill="#18312e" filter="url(#s)"/><rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="42" fill="${C.paper}"/><rect x="${w / 2 - 54}" y="23" width="108" height="18" rx="9" fill="#18312e"/><circle cx="${w - 35}" cy="${h - 35}" r="11" fill="${accent}"/>`);
  return sharp(frame).composite([{ input: capture, left: 14, top: 14, blend: "over" }, { input: svg(w, h, `<rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="42" fill="none" stroke="#18312e" stroke-width="9"/>`) }]).png().toBuffer();
}

async function campaignSlide(item, W, H, platform) {
  const isApple = platform === "apple";
  const primaryHero = item.slug === "01-home";
  const photoH = primaryHero ? Math.round(H * .52) : Math.round(H * .25);
  const p = await crop(path.join(root, item.photo), W, photoH, item.pos);
  const phoneW = Math.round(W * (primaryHero ? .70 : item.layout === "side" ? .74 : .77));
  const phoneH = Math.round(H * (item.layout === "photoTop" ? .45 : .54));
  const phone = await phoneCard(`${platform}/${item.capture}.png`, phoneW, phoneH, item.color);
  const brandIcon = await sharp(path.join(images, "icon.png")).resize(64, 64).png().toBuffer();
  const topPhoto = item.layout === "photoTop";
  const side = item.layout === "side";
  const hero = item.layout === "hero";
  const phoneX = primaryHero ? Math.round(W * .24) : side ? W - phoneW - Math.round(W * .06) : Math.round((W - phoneW) / 2);
  const phoneY = primaryHero ? Math.round(H * .42) : topPhoto ? Math.round(H * .53) : side ? Math.round(H * .39) : Math.round(H * .43);
  const photoY = primaryHero ? Math.round(H * .48) : topPhoto ? 0 : hero ? Math.round(H * .66) : side ? Math.round(H * .67) : Math.round(H * .69);
  const photoX = side ? 0 : 0;
  const photoW = primaryHero ? W : side ? Math.round(W * .58) : W;
  const photoForSlide = (side || primaryHero) ? await crop(path.join(root, item.photo), photoW, primaryHero ? photoH : Math.round(H * .33), item.pos) : p;
  const headlineY = topPhoto ? Math.round(H * .32) : Math.round(H * .12);
  const textX = Math.round(W * .075);
  const titleSize = Math.round(W * .07);
  const titleLines = wrapLines(item.title, titleSize, Math.round(W * .78));
  const subtitleY = headlineY + 65 + (titleLines.length * titleSize * 1.02) + 30;
  const badge = `<defs><filter id="d"><feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#18312e" flood-opacity=".17"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${C.cream}"/>
    <circle cx="${W * .92}" cy="${H * .09}" r="${W * .2}" fill="${item.color}" opacity=".16"/>
    <circle cx="${W * .07}" cy="${H * .57}" r="${W * .11}" fill="${item.color}" opacity=".12"/>
    ${round(textX, headlineY - 38, 205, 42, 21, item.color)}
    ${txt(textX + 18, headlineY - 10, item.kicker, 15, 800, C.ink)}
    ${titleLines.map((v, i) => txt(textX, headlineY + 65 + i * titleSize * 1.02, v, titleSize, 800)).join("")}
    ${wrap(textX, subtitleY, item.sub, Math.round(W * .031), Math.round(W * .69), 1.22, "#536762")}
    ${round(textX, H - 108, 145, 48, 24, C.ink)}${txt(textX + 20, H - 77, "FamilySync", 20, 800, C.paper)}
    ${txt(W - textX, H - 77, `${slides.indexOf(item) + 1} / 08`, 18, 800, C.ink, "end")}`;
  const comps = [{ input: svg(W, H, badge), left: 0, top: 0 }];
  // Photography is deliberately an editorial counterweight to the product, never a small decoration.
  comps.push(await layer(photoForSlide, photoX, photoY));
  comps.push({ input: svg(W, H, `<defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${C.cream}" stop-opacity="0"/><stop offset="1" stop-color="${C.cream}" stop-opacity=".92"/></linearGradient></defs><rect x="0" y="${photoY}" width="${side ? photoW : W}" height="${side ? Math.round(H * .33) : photoH}" fill="url(#g)"/>`), left: 0, top: 0 });
  comps.push(await layer(phone, phoneX, phoneY));
  comps.push({ input: brandIcon, left: textX, top: 42 });
  if (item.secondary) {
    const secondaryW = Math.round(W * .42);
    const secondaryH = Math.round(H * .255);
    const secondary = await phoneCard(`${platform}/${item.secondary}.png`, secondaryW, secondaryH, item.color);
    const secondaryX = side ? Math.round(W * .045) : Math.round(W * .055);
    const secondaryY = topPhoto ? Math.round(H * .72) : primaryHero ? Math.round(H * .69) : Math.round(H * .68);
    comps.push({ input: secondary, left: secondaryX, top: secondaryY });
    comps.push({ input: svg(W, H, `${round(secondaryX + 16, secondaryY - 38, 148, 32, 16, item.color)}${txt(secondaryX + 29, secondaryY - 17, "IN COPPIA", 12, 800, C.ink)}`), left: 0, top: 0 });
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: C.cream } }).composite(comps).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer();
}

async function feature() {
  const W = 1024, H = 500;
  const photo = await crop(path.join(root, "photo-family-planning.jpg"), 440, H, "left");
  const icon = await sharp(path.join(images, "icon.png")).resize(62, 62).png().toBuffer();
  const screen = await phoneCard("google/home.png", 245, 420, C.coral);
  const base = svg(W, H, `<rect width="${W}" height="${H}" fill="${C.cream}"/><circle cx="780" cy="82" r="160" fill="${C.teal}" opacity=".14"/><rect x="56" y="66" width="64" height="64" rx="18" fill="${C.paper}"/>${txt(138, 108, "FamilySync", 31, 800, C.ink)}${txt(56, 220, "La famiglia,", 48, 800)}${txt(56, 278, "finalmente insieme.", 44, 800)}${txt(58, 345, "Meno rincorse. Più vita vera.", 23, 600, "#536762")}<rect x="56" y="383" width="195" height="46" rx="23" fill="${C.coral}"/>${txt(78, 413, "TUTTO IN ORDINE", 15, 800, C.paper)}`);
  return sharp(base).composite([{ input: photo, left: 584, top: 0 }, { input: svg(W, H, `<rect x="584" width="440" height="500" fill="${C.ink}" opacity=".12"/>`), left: 0, top: 0 }, { input: screen, left: 690, top: 48 }, { input: icon, left: 57, top: 67 }]).jpeg({ quality: 94 }).toBuffer();
}

for (const item of slides) {
  await sharp(await campaignSlide(item, 1080, 1920, "google")).png().toFile(path.join(out, `google-${item.slug}.png`));
  await sharp(await campaignSlide(item, 1290, 2796, "apple")).png().toFile(path.join(out, `apple-${item.slug}.png`));
}
await sharp(await feature()).png().toFile(path.join(out, "google-feature-graphic.png"));

const thumbs = await Promise.all(slides.map(async (item) => ({ input: await sharp(path.join(out, `google-${item.slug}.png`)).resize(270, 480).jpeg().toBuffer() })));
const sheet = svg(1080, 1020, `<rect width="1080" height="1020" fill="${C.cream}"/>${txt(36, 55, "FamilySync — Google Play", 34, 800)}${txt(36, 88, "Anteprima campagna store", 19, 600, "#536762")}`);
await sharp(sheet).composite(thumbs.map((t, i) => ({ ...t, left: 12 + (i % 4) * 270, top: 120 + Math.floor(i / 4) * 480 }))).jpeg({ quality: 92 }).toFile(path.join(root, "anteprima-google-play.jpg"));

console.log("FamilySync store set generated: 8 Google, 8 Apple, feature graphic, contact sheet.");