import { eq, and, ne, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db";
import {
  users,
  families,
  familyMembers,
  familyInvites,
  emailVerificationTokens,
  passwordResetTokens,
  blocks,
  pushTokens,
  entitlements,
  chatMessages,
  billAttachments,
} from "../../shared/schema";
import { deleteUploadFiles } from "./uploads-cleanup";

export interface AccountDeletionSummary {
  familiesDeleted: number;
  membershipsRemoved: number;
  ownershipTransfers: number;
  filesDeleted: number;
}

/**
 * Elimina (anonimizza) l'account di un utente in una transazione.
 *
 * Strategia: molte tabelle hanno FK NOT NULL verso users (es. createdBy) senza
 * cascade, quindi NON si fa hard-delete della riga users. Si anonimizza la riga
 * users e si rimuovono i dati strettamente personali. I contenuti condivisi nelle
 * famiglie che continuano a esistere restano, ma l'autore appare come
 * "Utente eliminato".
 *
 * Famiglie:
 * - se l'utente e l'unico membro -> la famiglia viene eliminata (cascade pulisce
 *   eventi, liste, faccende, chat, bollette, ecc.);
 * - se ci sono altri membri e l'utente e l'unico admin -> il ruolo admin viene
 *   trasferito al membro piu anziano (joinedAt piu vecchio);
 * - la membership dell'utente viene comunque rimossa.
 */
export async function deleteUserAccount(
  userId: string
): Promise<AccountDeletionSummary> {
  // File fisici da rimuovere DOPO il commit della transazione: solo per le
  // famiglie effettivamente eliminate (utente unico membro). Se la famiglia
  // sopravvive con altri membri, gli allegati condivisi NON vengono toccati.
  const filesToDelete: Array<string | null | undefined> = [];

  const summary = await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    // L'avatar personale dell'utente (se salvato in /uploads) va rimosso.
    filesToDelete.push(user.avatarUrl);

    let familiesDeleted = 0;
    let membershipsRemoved = 0;
    let ownershipTransfers = 0;

    const memberships = await tx
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId));

    for (const membership of memberships) {
      const others = await tx
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.familyId, membership.familyId),
            ne(familyMembers.userId, userId)
          )
        );

      if (others.length === 0) {
        // Unico membro: raccogli i file collegati alla famiglia PRIMA di
        // eliminarla (il cascade DB rimuove i record, non i file fisici).
        const [familyRow] = await tx
          .select({ avatarUrl: families.avatarUrl })
          .from(families)
          .where(eq(families.id, membership.familyId))
          .limit(1);
        if (familyRow) filesToDelete.push(familyRow.avatarUrl);

        const chatFiles = await tx
          .select({ fileUrl: chatMessages.fileUrl })
          .from(chatMessages)
          .where(eq(chatMessages.familyId, membership.familyId));
        for (const c of chatFiles) filesToDelete.push(c.fileUrl);

        const attachmentFiles = await tx
          .select({ fileUrl: billAttachments.fileUrl })
          .from(billAttachments)
          .where(eq(billAttachments.familyId, membership.familyId));
        for (const a of attachmentFiles) filesToDelete.push(a.fileUrl);

        // Elimina l'intera famiglia (cascade rimuove tutti i record collegati).
        await tx.delete(families).where(eq(families.id, membership.familyId));
        familiesDeleted++;
        continue;
      }

      // Ci sono altri membri: assicurati che la famiglia mantenga un admin.
      if (membership.role === "admin") {
        const otherAdmins = others.filter((o) => o.role === "admin");
        if (otherAdmins.length === 0) {
          const successor = [...others].sort(
            (a, b) =>
              new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
          )[0];
          await tx
            .update(familyMembers)
            .set({ role: "admin" })
            .where(eq(familyMembers.id, successor.id));
          ownershipTransfers++;
        }
      }

      await tx
        .delete(familyMembers)
        .where(eq(familyMembers.id, membership.id));
      membershipsRemoved++;
    }

    // Dati strettamente personali.
    await tx.delete(pushTokens).where(eq(pushTokens.userId, userId));
    await tx
      .delete(blocks)
      .where(
        or(eq(blocks.blockerUserId, userId), eq(blocks.blockedUserId, userId))
      );
    // Inviti: rimuovi quelli creati/accettati dall'utente e quelli indirizzati
    // alla sua email (prima di anonimizzare l'email).
    await tx
      .delete(familyInvites)
      .where(
        or(
          eq(familyInvites.invitedBy, userId),
          eq(familyInvites.acceptedByUserId, userId),
          eq(familyInvites.email, user.email)
        )
      );
    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    // Stacca il riferimento personale da eventuali entitlement di famiglia.
    await tx
      .update(entitlements)
      .set({ userId: null })
      .where(eq(entitlements.userId, userId));

    // Anonimizza la riga users mantenendo l'integrita referenziale.
    const scrambledHash = await bcrypt.hash(
      `deleted-${userId}-${Date.now()}-${Math.random()}`,
      12
    );
    await tx
      .update(users)
      .set({
        email: `deleted-${userId}@deleted.familysync.invalid`,
        name: "Utente eliminato",
        passwordHash: scrambledHash,
        avatarUrl: null,
        emailVerified: false,
        aiFeaturesEnabled: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { familiesDeleted, membershipsRemoved, ownershipTransfers };
  });

  // Cancellazione file fisici SOLO dopo il commit riuscito della transazione:
  // le operazioni su filesystem non sono transazionali e non vanno eseguite se
  // il DB fa rollback. La funzione e sicura (solo /uploads, ignora i mancanti).
  const cleanup = await deleteUploadFiles(filesToDelete);

  return { ...summary, filesDeleted: cleanup.deleted };
}
