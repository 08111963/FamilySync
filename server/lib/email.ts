import sgMail from '@sendgrid/mail';

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM = process.env.EMAIL_FROM || 'noreply@familysync.app';

if (API_KEY) sgMail.setApiKey(API_KEY);

/**
 * True se il servizio email (SendGrid) è configurato e può inviare davvero.
 * Se false, in sviluppo le email vengono solo loggate; in produzione gli
 * endpoint che richiedono email devono fallire con EMAIL_NOT_CONFIGURED.
 */
export function isEmailConfigured(): boolean {
  return !!API_KEY;
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const link = `${process.env.CLIENT_URL}/verify-email/${token}`;

  if (!API_KEY) {
    console.log(`[DEV] Email verification link for ${email}: ${link}`);
    return;
  }

  await sgMail.send({
    to: email,
    from: FROM,
    subject: 'Verifica il tuo account Family Sync',
    html: `<h1>Ciao ${name}!</h1><p><a href="${link}">Verifica Email</a></p>`,
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const link = `${process.env.CLIENT_URL}/reset-password/${token}`;

  if (!API_KEY) {
    console.log(`[DEV] Password reset link for ${email}: ${link}`);
    return;
  }

  await sgMail.send({
    to: email,
    from: FROM,
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

  if (!API_KEY) {
    // In sviluppo non logghiamo il link completo per non normalizzare l'abitudine
    // (il link contiene il token monouso). Logghiamo solo l'evento.
    console.log(`[DEV] Family invite email queued for ${email} (famiglia: ${familyName})`);
    return;
  }

  await sgMail.send({
    to: email,
    from: FROM,
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
