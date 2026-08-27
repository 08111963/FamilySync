import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { configureExpoAndLanding } from "../index";
import helpRoutes from "../routes/help";
import legalRoutes from "../routes/legal";

type SeoPage = {
  path: string;
  title: string;
  description: string;
  openGraphType?: "article" | "website";
};

const legalPages: SeoPage[] = [
  {
    path: "/legal/privacy",
    title: "Privacy Policy - FamilySync",
    description:
      "Informativa sulla privacy di FamilySync: quali dati personali raccogliamo, come li utilizziamo, come li proteggiamo e i tuoi diritti GDPR.",
  },
  {
    path: "/legal/minori",
    title: "Privacy per Ragazze e Ragazzi - FamilySync",
    description:
      "Informativa privacy semplificata per ragazze e ragazzi che usano FamilySync, con indicazioni su dati, accesso e sicurezza.",
  },
  {
    path: "/legal/terms",
    title: "Termini d'Uso - FamilySync",
    description:
      "Termini d'Uso di FamilySync: regole di utilizzo del servizio, responsabilità, abbonamenti Premium e condizioni generali per l'accesso all'app.",
  },
  {
    path: "/legal/delete-account",
    title: "Eliminazione Account - FamilySync",
    description:
      "Come eliminare il tuo account FamilySync: procedura guidata dall'app, richiesta via email, dati rimossi e gestione degli abbonamenti Premium.",
  },
];

const guidePage: SeoPage = {
  path: "/help/user-guide",
  title: "Guida Utente - FamilySync",
  description:
    "Guida completa a FamilySync: calendario condiviso, lista spesa, faccende domestiche, bollette, chat familiare, ricette e piani pasti. Tutto quello che puoi fare con l'app.",
};

const appShellPages: SeoPage[] = [
  {
    path: "/",
    title: "FamilySync – App di Coordinamento Familiare",
    description:
      "FamilySync aiuta la tua famiglia a coordinare calendario, liste della spesa, faccende, bollette e chat in tempo reale. Gratuito e sicuro.",
    openGraphType: "website",
  },
  {
    path: "/welcome",
    title: "Benvenuto su FamilySync – Coordina la tua Famiglia",
    description:
      "Organizza la vita familiare con FamilySync: calendario condiviso, liste della spesa, faccende con punti, bollette e chat di gruppo. Inizia gratis.",
    openGraphType: "website",
  },
  {
    path: "/login",
    title: "Accedi o Registrati – FamilySync",
    description:
      "Accedi al tuo account FamilySync o registrati gratuitamente per iniziare a coordinare la tua famiglia.",
    openGraphType: "website",
  },
  {
    path: "/forgot-password",
    title: "Recupera Password – FamilySync",
    description:
      "Hai dimenticato la password FamilySync? Inserisci la tua email per ricevere le istruzioni di recupero accesso.",
    openGraphType: "website",
  },
  {
    path: "/reset-password/test-token",
    title: "Reimposta Password – FamilySync",
    description: "Crea una nuova password sicura per il tuo account FamilySync.",
    openGraphType: "website",
  },
];

const socialImageUrl = "https://familysync.eu/og-image.png";
const socialImageWidth = 1200;
const socialImageHeight = 630;

function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function findMetaContent(html: string, attribute: "name" | "property", value: string): string {
  const metaTag = Array.from(html.matchAll(/<meta\b[^>]*>/gi))
    .map((match) => match[0])
    .find((tag) => {
      const attributes = parseAttributes(tag);
      return attributes.get(attribute) === value;
    });
  assert.ok(metaTag, `meta ${attribute}="${value}" presente`);
  return parseAttributes(metaTag).get("content") ?? "";
}

function findCanonical(html: string): string {
  const canonicalTag = Array.from(html.matchAll(/<link\b[^>]*>/gi))
    .map((match) => match[0])
    .find((tag) => parseAttributes(tag).get("rel") === "canonical");
  assert.ok(canonicalTag, "link canonical presente");
  return parseAttributes(canonicalTag).get("href") ?? "";
}

function findTitle(html: string): string {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  assert.ok(title, "title presente");
  return title[1].trim();
}

function assertSeoMetadata(html: string, page: SeoPage, baseUrl: string): void {
  const canonical = `${baseUrl}${page.path}`;

  assert.equal(findTitle(html), page.title);
  assert.equal(findMetaContent(html, "name", "description"), page.description);
  assert.equal(findCanonical(html), canonical);

  assert.equal(findMetaContent(html, "property", "og:type"), page.openGraphType ?? "article");
  assert.equal(findMetaContent(html, "property", "og:site_name"), "FamilySync");
  assert.equal(findMetaContent(html, "property", "og:locale"), "it_IT");
  assert.equal(findMetaContent(html, "property", "og:title"), page.title);
  assert.equal(findMetaContent(html, "property", "og:description"), page.description);
  assert.equal(findMetaContent(html, "property", "og:url"), canonical);
  assert.equal(findMetaContent(html, "property", "og:image"), "https://familysync.eu/og-image.png");
  assert.equal(findMetaContent(html, "property", "og:image:width"), String(socialImageWidth));
  assert.equal(findMetaContent(html, "property", "og:image:height"), String(socialImageHeight));

  assert.equal(findMetaContent(html, "name", "twitter:card"), "summary_large_image");
  assert.equal(findMetaContent(html, "name", "twitter:title"), page.title);
  assert.equal(findMetaContent(html, "name", "twitter:description"), page.description);
  assert.equal(findMetaContent(html, "name", "twitter:image"), "https://familysync.eu/og-image.png");
}

function findFaqJsonLd(html: string): Record<string, unknown> {
  const script = html.match(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  assert.ok(script, "la guida deve contenere lo schema FAQ JSON-LD");
  const parsed: unknown = JSON.parse(script[1]);
  assert.ok(parsed && typeof parsed === "object", "lo schema FAQ deve essere un oggetto JSON");
  return parsed as Record<string, unknown>;
}

describe("metadati SEO delle pagine pubbliche SSR", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use("/legal", legalRoutes);
    app.use("/help", helpRoutes);

    server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("la guida utente conserva i metadati SEO e lo schema FAQ", async () => {
    const response = await fetch(`${baseUrl}${guidePage.path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html;\s*charset=utf-8/i);

    const html = await response.text();
    assertSeoMetadata(html, guidePage, baseUrl);

    const faq = findFaqJsonLd(html);
    assert.equal(faq["@context"], "https://schema.org");
    assert.equal(faq["@type"], "FAQPage");
    assert.ok(Array.isArray(faq.mainEntity));
    assert.ok(faq.mainEntity.length > 0, "lo schema FAQ deve contenere almeno una domanda");
    for (const entity of faq.mainEntity) {
      assert.equal((entity as Record<string, unknown>)["@type"], "Question");
      assert.ok((entity as Record<string, unknown>).name);
      const answer = (entity as Record<string, unknown>).acceptedAnswer as Record<string, unknown>;
      assert.equal(answer["@type"], "Answer");
      assert.ok(answer.text);
    }
  });

  test("tutte le route legali conservano i metadati SEO", async () => {
    for (const page of legalPages) {
      const response = await fetch(`${baseUrl}${page.path}`);
      assert.equal(response.status, 200, page.path);
      assert.match(
        response.headers.get("content-type") ?? "",
        /^text\/html;\s*charset=utf-8/i,
        page.path,
      );
      assertSeoMetadata(await response.text(), page, baseUrl);
    }
  });
});

describe("metadati SEO nel server di produzione", () => {
  let server: Server;
  let baseUrl: string;
  const seoOrigin = "https://seo-test.familysync.example";
  const previousClientUrl = process.env.CLIENT_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;

  before(async () => {
    mutableEnv.CLIENT_URL = seoOrigin;
    mutableEnv.NODE_ENV = "production";

    const app = express();
    app.set("trust proxy", 1);
    configureExpoAndLanding(app);

    server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousClientUrl === undefined) delete mutableEnv.CLIENT_URL;
    else mutableEnv.CLIENT_URL = previousClientUrl;
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
  });

  test("le route pubbliche ricevono metadati dall'HTML statico con Accept HTML", async () => {
    for (const page of appShellPages) {
      const response = await fetch(`${baseUrl}${page.path}`, {
        headers: { Accept: "text/html" },
      });
      assert.equal(response.status, 200, page.path);
      assert.match(
        response.headers.get("content-type") ?? "",
        /^text\/html;\s*charset=utf-8/i,
        page.path,
      );
      assert.equal(response.headers.get("cache-control"), "no-store", page.path);
      assertSeoMetadata(await response.text(), page, seoOrigin);
    }
  });

  test("le route private noindex mantengono la direttiva per i crawler", async () => {
    for (const page of appShellPages.filter((page) => page.path !== "/" && page.path !== "/welcome")) {
      const response = await fetch(`${baseUrl}${page.path}`, {
        headers: { Accept: "text/html" },
      });
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", page.path);
    }
  });

  test("l'immagine social pubblica è disponibile senza autenticazione", async () => {
    const imagePath = new URL(socialImageUrl).pathname;
    const response = await fetch(`${baseUrl}${imagePath}`);

    assert.equal(
      response.status,
      200,
      `Immagine social non disponibile pubblicamente: ${socialImageUrl}`,
    );
    assert.match(
      response.headers.get("content-type") ?? "",
      /^image\//i,
      `L'asset social ${socialImageUrl} non restituisce un Content-Type immagine`,
    );
    const imageBytes = Buffer.from(await response.arrayBuffer());
    assert.ok(imageBytes.byteLength > 0, `L'asset social ${socialImageUrl} è vuoto`);

    const metadata = await sharp(imageBytes).metadata();
    assert.equal(metadata.format, "png", `L'asset social ${socialImageUrl} deve essere PNG`);
    assert.equal(metadata.width, socialImageWidth, `L'asset social ${socialImageUrl} deve essere largo ${socialImageWidth}px`);
    assert.equal(metadata.height, socialImageHeight, `L'asset social ${socialImageUrl} deve essere alto ${socialImageHeight}px`);
  });
});

describe("metadati SEO con export Expo statico", () => {
  let server: Server;
  let baseUrl: string;
  let previousStaticMarker: Buffer | null = null;
  const staticMarker = path.resolve(process.cwd(), "web-build", "welcome.html");
  const previousClientUrl = process.env.CLIENT_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  const seoOrigin = "https://seo-static.familysync.example";

  before(async () => {
    if (fs.existsSync(staticMarker)) {
      previousStaticMarker = fs.readFileSync(staticMarker);
    }
    fs.writeFileSync(staticMarker, "<!doctype html><title>Static marker</title>");

    mutableEnv.CLIENT_URL = seoOrigin;
    mutableEnv.NODE_ENV = "production";

    const app = express();
    app.set("trust proxy", 1);
    configureExpoAndLanding(app);
    server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousStaticMarker === null) fs.rmSync(staticMarker, { force: true });
    else fs.writeFileSync(staticMarker, previousStaticMarker);
    if (previousClientUrl === undefined) delete mutableEnv.CLIENT_URL;
    else mutableEnv.CLIENT_URL = previousClientUrl;
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
  });

  test("home e login mantengono i tag social anche con output statico", async () => {
    for (const page of appShellPages.filter((page) => page.path === "/" || page.path === "/login")) {
      const response = await fetch(`${baseUrl}${page.path}`, {
        headers: { Accept: "text/html" },
      });
      assert.equal(response.status, 200, page.path);
      assert.equal(response.headers.get("cache-control"), "no-store", page.path);
      const html = await response.text();
      assertSeoMetadata(html, page, seoOrigin);
      if (page.path === "/welcome") {
        assert.doesNotMatch(html, /La tua famiglia, perfettamente coordinata/);
        assert.doesNotMatch(html, /background:linear-gradient\(160deg,#FF6B6B/);
      }
    }
  });
});
