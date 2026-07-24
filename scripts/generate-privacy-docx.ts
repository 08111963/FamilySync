// Genera docs/FamilySync_Privacy_Policy_v2.1.docx dalla FONTE UNICA condivisa
// (shared/privacy-policy-content.ts), la stessa usata da web e mobile.
// Uso: npx tsx scripts/generate-privacy-docx.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_INTRO,
  POLICY_APP_NAME,
  type PolicyBlock,
} from "../shared/privacy-policy-content";
import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_DATE } from "../shared/policy-version";

const OUT_PATH = resolve(__dirname, "..", "docs", `FamilySync_Privacy_Policy_v${PRIVACY_POLICY_VERSION}.docx`);

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Converte testo con **grassetto** in runs WordprocessingML.
function runs(text: string): string {
  return text
    .split(/\*\*/)
    .map((part, i) => {
      if (!part) return "";
      const bold = i % 2 === 1 ? "<w:rPr><w:b/></w:rPr>" : "";
      return `<w:r>${bold}<w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`;
    })
    .join("");
}

function paragraph(text: string, opts?: { style?: string; bullet?: boolean }): string {
  const pPrParts: string[] = [];
  if (opts?.style) pPrParts.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts?.bullet) pPrParts.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  const pPr = pPrParts.length > 0 ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}${runs(text)}</w:p>`;
}

function blockToXml(block: PolicyBlock): string {
  return block.type === "li" ? paragraph(block.text, { bullet: true }) : paragraph(block.text);
}

const bodyParts: string[] = [];
bodyParts.push(paragraph(`Privacy Policy — ${POLICY_APP_NAME}`, { style: "Title" }));
bodyParts.push(paragraph(PRIVACY_POLICY_INTRO));
for (const section of PRIVACY_POLICY_SECTIONS) {
  bodyParts.push(paragraph(section.title, { style: "Heading1" }));
  for (const block of section.blocks) {
    bodyParts.push(blockToXml(block));
  }
}
bodyParts.push(paragraph(`Ultimo aggiornamento: ${PRIVACY_POLICY_DATE} — Versione ${PRIVACY_POLICY_VERSION}`));

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParts.join("\n    ")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const workDir = mkdtempSync(join(tmpdir(), "policy-docx-"));
try {
  mkdirSync(join(workDir, "_rels"));
  mkdirSync(join(workDir, "word"));
  mkdirSync(join(workDir, "word", "_rels"));
  writeFileSync(join(workDir, "[Content_Types].xml"), contentTypes);
  writeFileSync(join(workDir, "_rels", ".rels"), rels);
  writeFileSync(join(workDir, "word", "document.xml"), documentXml);
  writeFileSync(join(workDir, "word", "styles.xml"), stylesXml);
  writeFileSync(join(workDir, "word", "numbering.xml"), numberingXml);
  writeFileSync(join(workDir, "word", "_rels", "document.xml.rels"), documentRels);

  const zipPath = join(workDir, "out.docx");
  execFileSync("zip", ["-r", "-X", zipPath, "[Content_Types].xml", "_rels", "word"], { cwd: workDir });
  copyFileSync(zipPath, OUT_PATH);
  console.log(`DOCX generato: ${OUT_PATH}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
