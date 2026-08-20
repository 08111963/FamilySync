import { Resend } from 'resend';
import { isChildSyntheticEmail } from './child-access';
import { logger } from './logger';
import { safeReturnTo } from '../../lib/safe-return-to';

// Le variabili d'ambiente vengono lette a RUNTIME (non a load-time) così che le
// funzioni di configurazione riflettano sempre lo stato reale del processo e
// siano testabili in modo deterministico.
function apiKey(): string {
  return (process.env.RESEND_API_KEY || '').trim();
}

function fromAddress(): string {
  return (process.env.EMAIL_FROM || 'noreply@familysync.eu').trim();
}

/**
 * Indirizzo a cui rispondono gli utenti (Reply-To). Il mittente è un dominio
 * "no-reply", quindi le risposte vengono indirizzate alla casella di assistenza
 * vera. Se non configurato, l'email viene comunque inviata senza Reply-To.
 */
function supportAddress(): string {
  return (process.env.SUPPORT_EMAIL || '').trim();
}

/**
 * Base URL pubblica usata per costruire i link nelle email (verifica, reset).
 * Può essere il dominio Replit provvisorio: non serve un dominio personalizzato,
 * ma DEVE essere configurata, altrimenti i link risulterebbero rotti.
 */
function clientBaseUrl(): string {
  return (process.env.CLIENT_URL || '').trim().replace(/\/+$/, '');
}

/**
 * True se il servizio email (Resend) è configurato e può inviare davvero.
 * Se false, in sviluppo le email vengono solo loggate; in produzione gli
 * endpoint che richiedono email devono fallire con EMAIL_NOT_CONFIGURED.
 */
export function isEmailConfigured(): boolean {
  return apiKey().length > 0;
}

/**
 * True se è possibile inviare email che contengono un LINK basato su CLIENT_URL
 * (verifica account, reset password). Oltre a Resend serve un CLIENT_URL valido
 * e un mittente: senza CLIENT_URL invieremmo link rotti tipo
 * `undefined/reset-password/<token>`.
 */
export function isLinkEmailConfigured(): boolean {
  return isEmailConfigured() && clientBaseUrl().length > 0 && fromAddress().length > 0;
}

/** Alias espliciti per i singoli flussi che inviano un link via CLIENT_URL. */
export function isPasswordResetEmailConfigured(): boolean {
  return isLinkEmailConfigured();
}

export function isVerificationEmailConfigured(): boolean {
  return isLinkEmailConfigured();
}

/**
 * True se è possibile inviare una richiesta di assistenza: serve Resend
 * configurato E una casella di assistenza (SUPPORT_EMAIL) a cui recapitarla.
 */
export function isSupportEmailConfigured(): boolean {
  return isEmailConfigured() && supportAddress().length > 0;
}

/**
 * Invia un'email tramite Resend. Centralizza la creazione del client e
 * l'aggiunta del Reply-To verso l'assistenza, così che ogni flusso resti
 * conciso. Lancia in caso di errore API (il chiamante gestisce/logga).
 */
async function sendEmail(params: { to: string; subject: string; html: string; replyTo?: string }): Promise<void> {
  // Guardia: gli account "dispositivo bambino" hanno un'email sintetica NON
  // recapitabile (@child.familysync.invalid). Nessun flusso deve mai provare a
  // inviare loro email: skip silenzioso (fail-safe, nessun errore Resend).
  if (isChildSyntheticEmail(params.to)) {
    logger.warn('Email verso indirizzo sintetico bambino ignorata', { subject: params.subject });
    return;
  }
  const resend = new Resend(apiKey());
  // Default: le risposte vanno alla casella di assistenza. Un chiamante può
  // sovrascrivere il Reply-To (es. richiesta di assistenza: rispondere all'utente).
  const replyTo = params.replyTo ?? supportAddress();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? 'unknown error'}`);
  }
}

/** Escape minimale per inserire testo utente dentro l'HTML dell'email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string,
  returnTo?: string,
) {
  const destination = safeReturnTo(returnTo);
  const link = `${clientBaseUrl()}/verify-email/${token}${
    destination ? `?returnTo=${encodeURIComponent(destination)}` : ''
  }`;
  const safeLink = escapeHtml(link);

  if (!isEmailConfigured()) {
    console.log(`[DEV] Email verification link for ${email}: ${link}`);
    return;
  }

  await sendEmail({
    to: email,
    subject: 'Verifica il tuo account Family Sync',
    html: `<h1>Ciao ${escapeHtml(name)}!</h1><p><a href="${safeLink}">Verifica Email</a></p>`,
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const link = `${clientBaseUrl()}/reset-password/${token}`;

  if (!isEmailConfigured()) {
    console.log(`[DEV] Password reset link for ${email}: ${link}`);
    return;
  }

  await sendEmail({
    to: email,
    subject: 'Reset Password - Family Sync',
    html: `<h1>Ciao ${name}</h1><p><a href="${link}">Reset Password</a></p>`,
  });
}

/**
 * Invia l'email di invito a una famiglia. Contiene SOLO un link sicuro: nessuna
 * password viene mai inviata via email. Il `link` completo è costruito dal
 * chiamante (rotta invito) e include il token monouso.
 */
export async function sendFamilyInviteEmail(
  email: string,
  familyName: string,
  inviterName: string,
  link: string,
  invitedName?: string,
) {
  const greeting = invitedName ? `Ciao ${invitedName}!` : 'Ciao!';

  if (!isEmailConfigured()) {
    // In sviluppo non logghiamo il link completo per non normalizzare l'abitudine
    // (il link contiene il token monouso). Logghiamo solo l'evento.
    console.log(`[DEV] Family invite email queued for ${email} (famiglia: ${familyName})`);
    return;
  }

  await sendEmail({
    to: email,
    subject: `${inviterName} ti ha invitato su FamilySync`,
    html: `
      <h1>${greeting}</h1>
      <p><strong>${inviterName}</strong> ti ha invitato a unirti alla famiglia <strong>${familyName}</strong> su FamilySync.</p>
      <p>Per accettare l'invito, apri questo link sicuro e crea la tua password:</p>
      <p><a href="${link}">Accetta l'invito</a></p>
      <p>Il link è personale, monouso e scade tra 72 ore. Non condividerlo con nessuno.</p>
      <p>Se non ti aspettavi questo invito, ignora questa email.</p>
    `,
  });
}

/**
 * Promemoria bolletta in scadenza. Inviata dal server (scheduler) ai membri
 * della famiglia con email verificata. `kind` distingue "scade domani" da
 * "scade oggi".
 */
export async function sendBillReminderEmail(params: {
  to: string;
  recipientName: string;
  billTitle: string;
  amount: string;
  dueDate: string; // già formattata (es. "23 luglio 2026")
  kind: 'due_tomorrow' | 'due_today';
}) {
  const when = params.kind === 'due_today' ? 'scade OGGI' : 'scade DOMANI';

  if (!isEmailConfigured()) {
    console.log(`[DEV] Promemoria bolletta "${params.billTitle}" (${when}) per ${params.to}`);
    return;
  }

  const name = escapeHtml(params.recipientName);
  const title = escapeHtml(params.billTitle);
  const amount = escapeHtml(params.amount);
  const dueDate = escapeHtml(params.dueDate);
  const appLink = clientBaseUrl();

  await sendEmail({
    to: params.to,
    subject: `Promemoria: la bolletta "${params.billTitle.replace(/[\r\n]+/g, ' ').trim()}" ${when.toLowerCase()}`,
    html: `
      <h2>Ciao ${name}!</h2>
      <p>La bolletta <strong>${title}</strong> di <strong>€ ${amount}</strong> ${when.toLowerCase()} (${dueDate}).</p>
      <p>Ricordati di pagarla e di segnarla come pagata nell'app.</p>
      ${appLink ? `<p><a href="${appLink}">Apri FamilySync</a></p>` : ''}
      <p style="color:#888;font-size:12px;">Ricevi questa email perché i promemoria sono attivi per questa bolletta.</p>
    `,
  });
}

/**
 * Promemoria evento del calendario. Inviata dal server (scheduler) ai membri
 * della famiglia con email verificata. `kind` distingue "domani" da "oggi".
 */
export async function sendEventReminderEmail(params: {
  to: string;
  recipientName: string;
  eventTitle: string;
  eventDate: string; // già formattata (es. "23 luglio 2026")
  eventTime?: string | null; // es. "15:30"
  location?: string | null;
  kind: 'event_tomorrow' | 'event_today';
  appPath?: string;
}) {
  const when = params.kind === 'event_today' ? 'è OGGI' : 'è DOMANI';

  if (!isEmailConfigured()) {
    console.log(`[DEV] Promemoria evento "${params.eventTitle}" (${when}) per ${params.to}`);
    return;
  }

  const name = escapeHtml(params.recipientName);
  const title = escapeHtml(params.eventTitle);
  const eventDate = escapeHtml(params.eventDate);
  const time = params.eventTime ? escapeHtml(params.eventTime) : '';
  const location = params.location ? escapeHtml(params.location) : '';
  const baseUrl = clientBaseUrl();
  const safePath =
    params.appPath?.startsWith('/') && !params.appPath.startsWith('//')
      ? params.appPath
      : '';
  const appLink = baseUrl ? escapeHtml(`${baseUrl}${safePath}`) : '';

  await sendEmail({
    to: params.to,
    subject: `Promemoria: l'evento "${params.eventTitle.replace(/[\r\n]+/g, ' ').trim()}" ${when.toLowerCase()}`,
    html: `
      <h2>Ciao ${name}!</h2>
      <p>L'evento <strong>${title}</strong> ${when.toLowerCase()} (${eventDate}${time ? ` alle ${time}` : ''}).</p>
      ${location ? `<p>Luogo: <strong>${location}</strong></p>` : ''}
      ${appLink ? `<p><a href="${appLink}">Apri FamilySync</a></p>` : ''}
      <p style="color:#888;font-size:12px;">Ricevi questa email perché fai parte della famiglia su FamilySync.</p>
    `,
  });
}

/**
 * Avvisa l'utente che il collegamento con Google Calendar è scaduto/revocato e
 * va ricollegato. Inviata UNA sola volta per transizione active→expired (il
 * dedup è a monte, nel chiamante). Best-effort: gli errori vanno solo loggati.
 */
export async function sendGcalConnectionExpiredEmail(params: {
  to: string;
  recipientName: string;
  reason?: string | null;
}) {
  if (!isEmailConfigured()) {
    console.log(`[DEV] Collegamento Google Calendar scaduto — email per ${params.to}`);
    return;
  }

  const name = escapeHtml(params.recipientName);
  const reason = params.reason ? escapeHtml(params.reason) : '';
  const base = clientBaseUrl();
  const link = base ? `${base}/calendar-sync` : '';

  await sendEmail({
    to: params.to,
    subject: 'Il collegamento con Google Calendar è scaduto: ricollegalo',
    html: `
      <h2>Ciao ${name}!</h2>
      <p>Il collegamento tra FamilySync e il tuo <strong>Google Calendar</strong> non è più valido:
      i nuovi eventi della famiglia <strong>non vengono più copiati</strong> nel tuo calendario.</p>
      ${reason ? `<p>Dettaglio: ${reason}</p>` : ''}
      <p>Per riprendere la sincronizzazione basta ricollegare l'account dalla pagina "Sincronizza calendario".</p>
      ${link ? `<p><a href="${link}">Ricollega Google Calendar</a></p>` : ''}
      <p style="color:#888;font-size:12px;">Ricevi questa email perché avevi collegato Google Calendar a FamilySync.</p>
    `,
  });
}

/**
 * Avviso di nuovo evento creato in calendario. Inviata (fire-and-forget dal
 * chiamante) agli ALTRI membri della famiglia con email verificata — mai
 * all'autore. Per le serie ricorrenti si invia UNA sola email per la serie.
 */
export async function sendNewEventEmail(params: {
  to: string;
  recipientName: string;
  creatorName: string;
  eventTitle: string;
  eventDate: string; // già formattata (es. "23 luglio 2026")
  eventTime?: string | null; // es. "15:30"
  location?: string | null;
  isRecurring: boolean;
}) {
  if (!isEmailConfigured()) {
    console.log(`[DEV] Nuovo evento "${params.eventTitle}" — email per ${params.to}`);
    return;
  }

  const name = escapeHtml(params.recipientName);
  const creator = escapeHtml(params.creatorName);
  const title = escapeHtml(params.eventTitle);
  const eventDate = escapeHtml(params.eventDate);
  const time = params.eventTime ? escapeHtml(params.eventTime) : '';
  const location = params.location ? escapeHtml(params.location) : '';
  const appLink = clientBaseUrl();
  const seriesNote = params.isRecurring
    ? `<p>Si tratta di un evento ricorrente: la prima occorrenza è il ${eventDate}${time ? ` alle ${time}` : ''}.</p>`
    : `<p>Quando: <strong>${eventDate}${time ? ` alle ${time}` : ''}</strong></p>`;

  await sendEmail({
    to: params.to,
    subject: `Nuovo evento in famiglia: "${params.eventTitle.replace(/[\r\n]+/g, ' ').trim()}"`,
    html: `
      <h2>Ciao ${name}!</h2>
      <p><strong>${creator}</strong> ha aggiunto l'evento <strong>${title}</strong> al calendario della famiglia.</p>
      ${seriesNote}
      ${location ? `<p>Luogo: <strong>${location}</strong></p>` : ''}
      ${appLink ? `<p><a href="${appLink}">Apri FamilySync</a></p>` : ''}
      <p style="color:#888;font-size:12px;">Ricevi questa email perché fai parte della famiglia su FamilySync.</p>
    `,
  });
}

/**
 * Notifica il proprietario dell'app (indirizzi in APP_OWNER_EMAILS) che un
 * tester ha inviato un nuovo feedback dal modulo "Dacci il tuo parere".
 * Fire-and-forget lato chiamante: eventuali errori vanno solo loggati e non
 * devono mai bloccare il salvataggio del feedback.
 */
export async function sendFeedbackNotificationEmail(params: {
  userName: string;
  userEmail: string;
  category: string;
  rating: number | null;
  message: string;
  platform: string | null;
  appVersion: string | null;
}) {
  const raw = process.env.APP_OWNER_EMAILS || '';
  const recipients = raw.split(',').map((e) => e.trim()).filter(Boolean);

  if (recipients.length === 0) {
    console.log('[feedback] APP_OWNER_EMAILS non configurata: nessuna email di notifica inviata');
    return;
  }
  if (!isEmailConfigured()) {
    console.log(`[DEV] Nuovo feedback (${params.category}) da ${params.userEmail}: ${params.message.slice(0, 80)}`);
    return;
  }

  const categoryLabels: Record<string, string> = {
    bug: 'Bug',
    suggestion: 'Suggerimento',
    other: 'Altro',
  };
  const categoryLabel = categoryLabels[params.category] ?? params.category;

  const name = escapeHtml(params.userName);
  const userEmail = escapeHtml(params.userEmail);
  const messageHtml = escapeHtml(params.message).replace(/\n/g, '<br/>');
  const ratingLine = params.rating
    ? `<p><strong>Valutazione:</strong> ${'★'.repeat(params.rating)}${'☆'.repeat(5 - params.rating)} (${params.rating}/5)</p>`
    : '';
  const details = [params.platform, params.appVersion].filter(Boolean).map((v) => escapeHtml(v as string)).join(' · ');
  const detailsLine = details ? `<p style="color:#888;font-size:12px;">${details}</p>` : '';

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        replyTo: params.userEmail,
        subject: `[Feedback tester] ${categoryLabel} da ${params.userName.replace(/[\r\n]+/g, ' ').trim()}`,
        html: `
          <h2>Nuovo feedback tester (${escapeHtml(categoryLabel)})</h2>
          <p><strong>Da:</strong> ${name} &lt;${userEmail}&gt;</p>
          ${ratingLine}
          <hr/>
          <p>${messageHtml}</p>
          <hr/>
          ${detailsLine}
          <p style="color:#888;font-size:12px;">Rispondi a questa email per contattare direttamente il tester.</p>
        `,
      })
    )
  );
}

/**
 * Avvisa il proprietario dell'app (APP_OWNER_EMAILS) che sono arrivati
 * più CLIENT_CRASH ravvicinati dal web (tipicamente browser in-app tipo
 * WhatsApp/Gmail con WebView datato e polyfill mancante). Best-effort:
 * il chiamante logga gli errori e non deve mai bloccare l'endpoint.
 * Ritorna il numero di destinatari a cui l'email è stata inviata (0 se
 * APP_OWNER_EMAILS o l'email non sono configurati).
 */
export async function sendClientCrashAlertEmail(report: {
  count: number;
  windowMinutes: number;
  samples: Array<{
    message: string;
    url?: string;
    userAgent?: string;
    platform?: string;
    at: string;
  }>;
}): Promise<number> {
  const raw = process.env.APP_OWNER_EMAILS || '';
  const recipients = raw.split(',').map((e) => e.trim()).filter(Boolean);

  if (recipients.length === 0) {
    console.log(
      `[client-crash-alert] APP_OWNER_EMAILS non configurata: ${report.count} crash solo nei log`
    );
    return 0;
  }
  if (!isEmailConfigured()) {
    console.log(
      `[DEV] Client crash alert: ${report.count} crash negli ultimi ${report.windowMinutes} minuti`
    );
    return 0;
  }

  const rows = report.samples
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.at)}</td><td>${escapeHtml(s.message)}</td><td>${escapeHtml(s.url ?? '-')}</td><td>${escapeHtml(s.platform ?? '-')}</td><td style="font-size:11px;">${escapeHtml(s.userAgent ?? '-')}</td></tr>`
    )
    .join('');

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: `[FamilySync] ${report.count} crash client negli ultimi ${report.windowMinutes} min`,
        html: `
          <h2>Crash ripetuti del client web</h2>
          <p>Ricevuti <strong>${report.count}</strong> report CLIENT_CRASH negli ultimi <strong>${report.windowMinutes}</strong> minuti.
          Se lo user agent indica un browser in-app (WhatsApp/Gmail/Instagram), probabilmente manca un polyfill:
          controlla il messaggio d'errore qui sotto e <code>lib/runtime-polyfills.ts</code>.</p>
          <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <tr><th>Quando (UTC)</th><th>Messaggio</th><th>URL</th><th>Piattaforma</th><th>User agent</th></tr>
            ${rows}
          </table>
          <p style="color:#888;font-size:12px;">Dettagli completi (stack) nei log server con tag CLIENT_CRASH. Soglia/finestra/cooldown configurabili via CLIENT_CRASH_ALERT_THRESHOLD / _WINDOW_MINUTES / _COOLDOWN_MINUTES.</p>
        `,
      })
    )
  );

  return recipients.length;
}

/**
 * Avvisa il proprietario dell'app (APP_OWNER_EMAILS) che la scansione di
 * integrità degli upload ha trovato allegati orfani (file_url/avatar_url che
 * puntano a file inesistenti). Best-effort: il chiamante logga gli errori e
 * non deve mai bloccare la scansione.
 */
export async function sendUploadIntegrityAlertEmail(report: {
  checked: number;
  autoClean: boolean;
  orphans: Array<{
    source: string;
    rowId: string;
    fileUrl: string;
    reason: string;
    cleaned: boolean;
  }>;
  /** Oggetti bucket esaminati nella direzione bucket→DB (opzionale). */
  bucketChecked?: number;
  /** File nel bucket non referenziati più da nessuna riga (opzionale). */
  forgotten?: Array<{ key: string; deleted: boolean }>;
}) {
  const forgotten = report.forgotten ?? [];
  const totalIssues = report.orphans.length + forgotten.length;
  const raw = process.env.APP_OWNER_EMAILS || '';
  const recipients = raw.split(',').map((e) => e.trim()).filter(Boolean);

  if (recipients.length === 0) {
    console.log(
      `[upload-integrity] APP_OWNER_EMAILS non configurata: ${totalIssues} anomalie solo nei log`
    );
    return;
  }
  if (!isEmailConfigured()) {
    console.log(
      `[DEV] Upload integrity: ${report.orphans.length} orfani su ${report.checked} controllati, ${forgotten.length} file bucket dimenticati`
    );
    return;
  }

  const rows = report.orphans
    .map(
      (o) =>
        `<tr><td>${escapeHtml(o.source)}</td><td>${escapeHtml(o.rowId)}</td><td>${escapeHtml(o.fileUrl)}</td><td>${escapeHtml(o.reason)}</td><td>${o.cleaned ? 'sì' : 'no'}</td></tr>`
    )
    .join('');

  const orphansSection =
    report.orphans.length > 0
      ? `
          <h3>Righe DB che puntano a file mancanti (${report.orphans.length})</h3>
          <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <tr><th>Tabella</th><th>ID riga</th><th>File URL</th><th>Motivo</th><th>Ripulito</th></tr>
            ${rows}
          </table>`
      : '';

  const forgottenRows = forgotten
    .map((f) => `<tr><td>${escapeHtml(f.key)}</td><td>${f.deleted ? 'sì' : 'no'}</td></tr>`)
    .join('');

  const forgottenSection =
    forgotten.length > 0
      ? `
          <h3>File nel bucket senza più alcun riferimento nel DB (${forgotten.length})</h3>
          <p style="font-size:13px;">Occupano spazio e possono contenere dati personali che dovevano essere eliminati.</p>
          <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <tr><th>Chiave oggetto</th><th>Eliminato</th></tr>
            ${forgottenRows}
          </table>`
      : '';

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: `[FamilySync] ${totalIssues} anomalie integrità upload rilevate`,
        html: `
          <h2>Scansione integrità upload</h2>
          <p>Controllati <strong>${report.checked}</strong> riferimenti DB e <strong>${report.bucketChecked ?? 0}</strong> oggetti bucket;
          trovati <strong>${report.orphans.length}</strong> riferimenti orfani e <strong>${forgotten.length}</strong> file bucket dimenticati.
          Auto-cleanup: <strong>${report.autoClean ? 'ATTIVO' : 'disattivo (solo segnalazione)'}</strong>.</p>
          ${orphansSection}
          ${forgottenSection}
          <p style="color:#888;font-size:12px;">Vedi i log con tag UPLOAD_INTEGRITY per i dettagli. Per l'auto-cleanup imposta UPLOAD_INTEGRITY_AUTO_CLEAN=true.</p>
        `,
      })
    )
  );
}

/**
 * Avvisa il proprietario dell'app (APP_OWNER_EMAILS) che la valutazione
 * periodica dei piani mediterranei REALI ha rilevato squilibri (troppi legumi,
 * poca pasta, verdure/pesce mancanti). Best-effort: il chiamante logga gli
 * errori e non deve mai bloccare la valutazione.
 */
export async function sendMealPlanBalanceAlertEmail(report: {
  weekStartDate: string;
  runs: Array<{ run: number; balanced: boolean; issues: string[] }>;
}) {
  const unbalanced = report.runs.filter((r) => !r.balanced);
  const raw = process.env.APP_OWNER_EMAILS || '';
  const recipients = raw.split(',').map((e) => e.trim()).filter(Boolean);

  if (recipients.length === 0) {
    console.log(
      `[meal-plan-balance] APP_OWNER_EMAILS non configurata: ${unbalanced.length} run squilibrate solo nei log`
    );
    return;
  }
  if (!isEmailConfigured()) {
    console.log(
      `[DEV] Meal plan balance: ${unbalanced.length}/${report.runs.length} run squilibrate (settimana ${report.weekStartDate})`
    );
    return;
  }

  const sections = unbalanced
    .map(
      (r) => `
        <h3>Run ${r.run}</h3>
        <ul>${r.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    )
    .join('');

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: `[FamilySync] Piano mediterraneo AI squilibrato (${unbalanced.length}/${report.runs.length} run)`,
        html: `
          <h2>Valutazione equilibrio piano mediterraneo</h2>
          <p>La valutazione periodica con AI reale (settimana dal <strong>${escapeHtml(report.weekStartDate)}</strong>)
          ha rilevato squilibri in <strong>${unbalanced.length}</strong> run su ${report.runs.length}.</p>
          ${sections}
          <p style="color:#888;font-size:12px;">Vedi i log con tag MEAL_PLAN_BALANCE per i dettagli.
          Esecuzione manuale: npx tsx scripts/eval-meal-plan-balance.ts</p>
        `,
      })
    )
  );
}

/**
 * Invia alla casella di assistenza una richiesta inviata da un utente dall'app.
 * Il Reply-To è impostato sull'email dell'utente, così l'assistenza può
 * rispondere direttamente con un semplice "Rispondi". Il chiamante deve aver già
 * verificato `isSupportEmailConfigured()` (in produzione fallisce esplicitamente).
 */
export async function sendSupportRequestEmail(params: {
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
}) {
  const support = supportAddress();

  if (!isSupportEmailConfigured()) {
    console.log(`[DEV] Richiesta assistenza da ${params.userEmail}: ${params.subject}`);
    return;
  }

  const name = escapeHtml(params.userName);
  const userEmail = escapeHtml(params.userEmail);
  const subject = escapeHtml(params.subject);
  const messageHtml = escapeHtml(params.message).replace(/\n/g, '<br/>');

  // Rimuovi CR/LF dall'oggetto: hardening contro header-injection.
  const safeSubject = params.subject.replace(/[\r\n]+/g, ' ').trim();

  await sendEmail({
    to: support,
    replyTo: params.userEmail,
    subject: `[Assistenza] ${safeSubject}`,
    html: `
      <h2>Nuova richiesta di assistenza</h2>
      <p><strong>Da:</strong> ${name} &lt;${userEmail}&gt;</p>
      <p><strong>Oggetto:</strong> ${subject}</p>
      <hr/>
      <p>${messageHtml}</p>
      <hr/>
      <p style="color:#888;font-size:12px;">Rispondi a questa email per contattare direttamente l'utente.</p>
    `,
  });
}
