import { Resend } from 'resend';

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

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const link = `${clientBaseUrl()}/verify-email/${token}`;

  if (!isEmailConfigured()) {
    console.log(`[DEV] Email verification link for ${email}: ${link}`);
    return;
  }

  await sendEmail({
    to: email,
    subject: 'Verifica il tuo account Family Sync',
    html: `<h1>Ciao ${name}!</h1><p><a href="${link}">Verifica Email</a></p>`,
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
