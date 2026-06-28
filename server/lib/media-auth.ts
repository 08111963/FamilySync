import { db } from '../db';
import { chatMessages, billAttachments, familyMembers, blocks } from '../../shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { isPremium } from './entitlements';

export function normalizeUploadFileUrl(p: string): string {
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    decoded = p;
  }
  const filename = decoded.replace(/^\/+/, '').replace(/^uploads\/+/, '');
  return `/uploads/${filename}`;
}

export async function userIsFamilyMember(userId: string, familyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  return !!row;
}

export async function usersHaveBlockRelationship(
  userA: string,
  userB: string,
  familyId: string
): Promise<boolean> {
  if (userA === userB) return false;
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      and(
        eq(blocks.familyId, familyId),
        or(
          and(eq(blocks.blockerUserId, userA), eq(blocks.blockedUserId, userB)),
          and(eq(blocks.blockerUserId, userB), eq(blocks.blockedUserId, userA))
        )
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Store dei dati necessari a decidere l'accesso ai file in /uploads.
 * Iniettabile nei test (vedi __setMediaAccessStoreForTest) per evitare il DB reale.
 * Ogni "find" applica già il controllo di appartenenza alla famiglia (join su userId):
 * se l'utente non è membro della famiglia del file, ritorna null.
 */
export interface MediaAccessStore {
  /** File di un messaggio chat accessibile all'utente (membro della famiglia). */
  findChatFileAccess(
    userId: string,
    fileUrl: string
  ): Promise<{ familyId: string; authorId: string } | null>;
  /** Allegato bolletta accessibile all'utente (membro della famiglia). */
  findBillAttachmentAccess(
    userId: string,
    fileUrl: string
  ): Promise<{ familyId: string } | null>;
  /** Relazione di blocco fra due utenti nella stessa famiglia (solo chat). */
  hasBlockRelationship(userA: string, userB: string, familyId: string): Promise<boolean>;
  /** Famiglia Premium? Gli allegati bolletta sono una funzione Premium. */
  isFamilyPremium(familyId: string): Promise<boolean>;
}

const dbMediaAccessStore: MediaAccessStore = {
  async findChatFileAccess(userId, fileUrl) {
    const [row] = await db
      .select({ familyId: chatMessages.familyId, authorId: chatMessages.userId })
      .from(chatMessages)
      .innerJoin(familyMembers, eq(familyMembers.familyId, chatMessages.familyId))
      .where(and(eq(chatMessages.fileUrl, fileUrl), eq(familyMembers.userId, userId)))
      .limit(1);
    return row ?? null;
  },
  async findBillAttachmentAccess(userId, fileUrl) {
    const [row] = await db
      .select({ familyId: billAttachments.familyId })
      .from(billAttachments)
      .innerJoin(familyMembers, eq(familyMembers.familyId, billAttachments.familyId))
      .where(and(eq(billAttachments.fileUrl, fileUrl), eq(familyMembers.userId, userId)))
      .limit(1);
    return row ?? null;
  },
  async hasBlockRelationship(userA, userB, familyId) {
    return usersHaveBlockRelationship(userA, userB, familyId);
  },
  async isFamilyPremium(familyId) {
    return isPremium(familyId);
  },
};

let activeMediaAccessStore: MediaAccessStore = dbMediaAccessStore;

export function __setMediaAccessStoreForTest(store: MediaAccessStore): void {
  activeMediaAccessStore = store;
}

export function __resetMediaAccessStoreForTest(): void {
  activeMediaAccessStore = dbMediaAccessStore;
}

/**
 * Risolve l'accesso a un file in /uploads per un dato utente.
 * Ritorna la familyId proprietaria del file se l'accesso è consentito, altrimenti null.
 *
 * Ordine: prima i file della chat, poi gli allegati delle bollette.
 * - Chat: l'utente deve essere membro; se non è l'autore e c'è un blocco -> negato.
 * - Allegati bollette: l'utente deve essere membro E la famiglia deve essere Premium
 *   (gli allegati sono una funzione Premium, gating fail-closed anche in lettura).
 */
export async function resolveUploadFileAccess(
  userId: string,
  fileUrlOrPath: string
): Promise<string | null> {
  const fileUrl = normalizeUploadFileUrl(fileUrlOrPath);

  const chatRow = await activeMediaAccessStore.findChatFileAccess(userId, fileUrl);
  if (chatRow) {
    if (chatRow.authorId !== userId) {
      const blocked = await activeMediaAccessStore.hasBlockRelationship(
        userId,
        chatRow.authorId,
        chatRow.familyId
      );
      if (blocked) return null;
    }
    return chatRow.familyId;
  }

  const billRow = await activeMediaAccessStore.findBillAttachmentAccess(userId, fileUrl);
  if (billRow) {
    const premium = await activeMediaAccessStore.isFamilyPremium(billRow.familyId);
    if (!premium) return null;
    return billRow.familyId;
  }

  return null;
}

/**
 * Decisione pura di autorizzazione del media token (no I/O).
 * Verifica che il token sia valido PER QUESTO file: il filePath del token (se presente)
 * deve combaciare con il file richiesto, e la familyId del token (se presente) deve
 * combaciare con la famiglia proprietaria del file. Evita che un token valido per un
 * file/famiglia dia accesso a file di un'altra famiglia.
 */
export function authorizeMediaRequest(input: {
  requestedFileUrl: string;
  fileFamilyId: string | null;
  tokenFilePath?: string | null;
  tokenFamilyId?: string | null;
}): { ok: true } | { ok: false; code: 'FORBIDDEN_FILE' } {
  const requested = normalizeUploadFileUrl(input.requestedFileUrl);

  if (input.tokenFilePath) {
    const allowed = normalizeUploadFileUrl(input.tokenFilePath);
    if (requested !== allowed) return { ok: false, code: 'FORBIDDEN_FILE' };
  }

  if (!input.fileFamilyId) return { ok: false, code: 'FORBIDDEN_FILE' };

  if (input.tokenFamilyId && input.tokenFamilyId !== input.fileFamilyId) {
    return { ok: false, code: 'FORBIDDEN_FILE' };
  }

  return { ok: true };
}
