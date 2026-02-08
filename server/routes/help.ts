import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const APP_NAME = "FamilySync";
const DEVELOPER = "FamilySync Team";

function markdownToHtml(md: string): string {
  let html = md;

  html = html.replace(/^---$/gm, '');

  html = html.replace(/^> (.+)$/gm, '<div class="tip"><strong>Nota:</strong> $1</div>');

  html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#{2}\s+(.+)$/gm, (_, title) => {
    const id = title.toLowerCase()
      .replace(/[^a-z0-9àèìòùé\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[\d]+-/, '')
      .trim();
    return `<h2 id="${id}">${title}</h2>`;
  });
  html = html.replace(/^#{1}\s+(.+)$/gm, '');

  html = html.replace(/\| (.+) \|/g, (match) => {
    return match;
  });

  const lines = html.split('\n');
  const output: string[] = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;
  let inCheckList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        if (inList) { output.push('</ul>'); inList = false; }
        if (inCheckList) { output.push('</ul>'); inCheckList = false; }
        inTable = true;
        tableHeaderDone = false;
        output.push('<table>');
      }
      if (line.replace(/[|\s-]/g, '') === '') {
        tableHeaderDone = true;
        continue;
      }
      const cells = line.split('|').filter(c => c.trim() !== '');
      const tag = !tableHeaderDone ? 'th' : 'td';
      const row = cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('');
      output.push(`<tr>${row}</tr>`);
      if (!tableHeaderDone) tableHeaderDone = true;
      continue;
    } else if (inTable) {
      output.push('</table>');
      inTable = false;
    }

    if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
      if (!inCheckList) {
        if (inList) { output.push('</ul>'); inList = false; }
        inCheckList = true;
        output.push('<ul class="checklist">');
      }
      const checked = line.startsWith('- [x]');
      const text = line.replace(/^- \[.\]\s*/, '');
      const formatted = formatInline(text);
      output.push(`<li><input type="checkbox" disabled ${checked ? 'checked' : ''}> ${formatted}</li>`);
      continue;
    } else if (inCheckList && !line.startsWith('- ')) {
      output.push('</ul>');
      inCheckList = false;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        inList = true;
        output.push('<ul>');
      }
      const text = line.replace(/^-\s+/, '');
      const formatted = formatInline(text);
      output.push(`<li>${formatted}</li>`);
      continue;
    } else if (inList && line !== '' && !line.startsWith('  - ')) {
      output.push('</ul>');
      inList = false;
    }

    if (line.startsWith('  - ')) {
      if (!inList) {
        inList = true;
        output.push('<ul>');
      }
      const text = line.replace(/^\s+-\s+/, '');
      const formatted = formatInline(text);
      output.push(`<li style="margin-left:16px">${formatted}</li>`);
      continue;
    }

    if (line.startsWith('<')) {
      output.push(line);
      continue;
    }

    if (line.match(/^\d+\.\s+/)) {
      const text = line.replace(/^\d+\.\s+/, '');
      const formatted = formatInline(text);
      output.push(`<p>${formatted}</p>`);
      continue;
    }

    if (line === '') {
      if (inList) { output.push('</ul>'); inList = false; }
      continue;
    }

    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      const text = line.replace(/^\*|\*$/g, '');
      output.push(`<p class="update-date">${formatInline(text)}</p>`);
      continue;
    }

    output.push(`<p>${formatInline(line)}</p>`);
  }

  if (inList) output.push('</ul>');
  if (inCheckList) output.push('</ul>');
  if (inTable) output.push('</table>');

  return output.join('\n');
}

function formatInline(text: string): string {
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\(#[^)]+\)/g, '$1');
  return text;
}

function htmlWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${APP_NAME}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fafafa;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #4A90D9, #67B8F0);
      padding: 48px 24px 32px;
      text-align: center;
    }
    .header h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .subtitle {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
    }
    .content {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 32px 0 12px;
      color: #1a1a2e;
      padding-bottom: 8px;
      border-bottom: 2px solid #4A90D9;
    }
    h3 {
      font-size: 17px;
      font-weight: 600;
      margin: 20px 0 8px;
      color: #333;
    }
    p, li {
      font-size: 15px;
      color: #333;
      margin-bottom: 10px;
    }
    ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    li { margin-bottom: 6px; }
    a { color: #4A90D9; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: #1a1a2e; }
    .tip {
      background: #E8F4FD;
      border-left: 4px solid #4A90D9;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
      font-size: 14px;
    }
    .tip strong { color: #4A90D9; }
    .update-date {
      font-size: 13px;
      color: #888;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 13px;
      color: #888;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }
    th {
      background: #4A90D9;
      color: #fff;
      font-weight: 600;
    }
    .checklist {
      list-style: none;
      padding-left: 4px;
    }
    .checklist li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
    }
    .checklist input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #4A90D9;
    }
    @media (max-width: 480px) {
      .header { padding: 40px 16px 24px; }
      .content { padding: 24px 16px 48px; }
      h2 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">${APP_NAME}</div>
  </div>
  <div class="content">
    ${body}
  </div>
  <div class="footer">&copy; 2026 ${DEVELOPER}. Tutti i diritti riservati.</div>
</body>
</html>`;
}

router.get('/user-guide', (_req: Request, res: Response) => {
  try {
    const mdPath = path.resolve(process.cwd(), 'docs', 'guida-utente.md');
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    const bodyHtml = markdownToHtml(mdContent);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlWrapper('Guida Utente', bodyHtml));
  } catch (err) {
    res.status(500).send('Errore nel caricamento della guida utente.');
  }
});

export default router;
