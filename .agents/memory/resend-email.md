---
name: Resend email (FamilySync)
description: Email transazionali via Resend — provider, mittente/reply-to, dominio verificato, e vincolo di redeploy in produzione.
---

# Email transazionali via Resend

FamilySync invia email (inviti famiglia, verifica account, reset password) tramite **Resend**, migrato da SendGrid. Logica centralizzata in `server/lib/email.ts`.

- **Segreto**: `RESEND_API_KEY` (l'account Resend è condiviso con un altro progetto, ha anche il dominio `nutrieasy.eu`).
- **Mittente**: `EMAIL_FROM` = `noreply@familysync.eu`.
- **Reply-To**: `SUPPORT_EMAIL` = `assistenza@familysync.it` (casella VERA su dominio `.it`). Aggiunto solo se presente.
- **Link nelle email**: `CLIENT_URL` = `https://familysync.eu`.

**Why**: il dominio `.eu` su Aruba ha solo DNS, NESSUN servizio di posta; la casella di assistenza vera vive sul dominio `.it`. Per questo il mittente è no-reply su `.eu` e le risposte vanno a `.it`.

## Verifica dominio Resend
Il dominio `familysync.eu` è **verificato** su Resend (regione EU `eu-west-1`). Record DNS configurati su Aruba:
- DKIM: `TXT resend._domainkey` (chiave lunga `p=MIGf...`)
- SPF: `TXT send` = `v=spf1 include:amazonses.com ~all`
- MX: `MX send` -> `feedback-smtp.eu-west-1.amazonses.com` priorità 10 (aggiunto su Aruba via "Record MX" → "Aggiungi su sottodominio", host `send`)

**How to apply**: se l'invio email smette di funzionare, controllare lo stato dominio via `resend.domains.get(<id>)` e che i record DNS siano ancora pubblici (Aruba). NON sono nel codice.

## Vincolo produzione (IMPORTANTE)
`RESEND_API_KEY` e le env (`EMAIL_FROM`/`SUPPORT_EMAIL`/`CLIENT_URL`, in ambiente `shared`) sono stati aggiunti DOPO l'ultimo deploy. Il deployment autoscale di `familysync.eu` deve essere **ripubblicato** per caricarli: finché non si ripubblica, in produzione l'invio email resta non configurato (`EMAIL_NOT_CONFIGURED`).

**Why**: env/secrets vengono iniettati al momento del deploy; il processo prod già in esecuzione non li vede.
