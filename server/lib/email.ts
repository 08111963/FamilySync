import sgMail from '@sendgrid/mail';

// Le variabili d'ambiente vengono lette a RUNTIME (non a load-time) così che le
// funzioni di configurazione riflettano sempre lo stato reale del processo e
// siano testabili in modo deterministico.
function apiKey(): string {
  return (process.env.SENDGRID_API_KEY || '').trim();
}

function fromAddress(): string {
  return (process.env.EMAIL_FROM || 'noreply@familysync.app').trim();
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
 * True se il servizio email (SendGrid) è configurato e può inviare davvero.
 * Se false, in sviluppo le email vengono solo loggate; in produzione gli
 * endpoint che richiedono email devono fallire con EMAIL_NOT_CONFIGURED.
 */
export function isEmailConfigured(): boolean {
  return apiKey().length > 0;
}

/**
 * True se è possibile inviare email che contengono un LINK basato su CLIENT_URL
 * (verifica account, reset password). Oltre a SendGrid serve un CLIENT_URL valido
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

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const link = `${clientBaseUrl()}/verify-email/${token}`;

  if (!isEmailConfigured()) {
    console.log(`[DEV] Email verification link for ${email}: ${link}`);
    return;
  }

  sgMail.setApiKey(apiKey());
  await sgMail.send({
    to: email,
    from: fromAddress(),
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

  sgMail.setApiKey(apiKey());
  await sgMail.send({
    to: email,
    from: fromAddress(),
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

  sgMail.setApiKey(apiKey());
  await sgMail.send({
    to: email,
    from: fromAddress(),
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
