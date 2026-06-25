import { db } from '../db';
import { chatMessages, familyMembers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

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

export async function resolveUploadFileAccess(
  userId: string,
  fileUrlOrPath: string
): Promise<string | null> {
  const fileUrl = normalizeUploadFileUrl(fileUrlOrPath);
  const [row] = await db
    .select({ familyId: chatMessages.familyId })
    .from(chatMessages)
    .innerJoin(familyMembers, eq(familyMembers.familyId, chatMessages.familyId))
    .where(and(eq(chatMessages.fileUrl, fileUrl), eq(familyMembers.userId, userId)))
    .limit(1);
  return row ? row.familyId : null;
}
