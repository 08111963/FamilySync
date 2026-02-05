import sgMail from '@sendgrid/mail';

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM = process.env.EMAIL_FROM || 'noreply@familysync.app';

if (API_KEY) sgMail.setApiKey(API_KEY);

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

export async function sendFamilyInviteEmail(email: string, familyName: string, inviterName: string, token: string) {
  const link = `${process.env.CLIENT_URL}/join/${token}`;
  
  if (!API_KEY) {
    console.log(`[DEV] Family invite link for ${email}: ${link}`);
    return;
  }
  
  await sgMail.send({
    to: email,
    from: FROM,
    subject: `${inviterName} ti ha invitato a ${familyName}!`,
    html: `<h1>Hai un invito!</h1><p><a href="${link}">Accetta Invito</a></p>`,
  });
}
