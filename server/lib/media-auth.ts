import { db } from '../db';
import { chatMessages, familyMembers, blocks } from '../../shared/schema';
import { eq, and, or } from 'drizzle-orm';

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

export async function resolveUploadFileAccess(
  userId: string,
  fileUrlOrPath: string
): Promise<string | null> {
  const fileUrl = normalizeUploadFileUrl(fileUrlOrPath);
  const [row] = await db
    .select({ familyId: chatMessages.familyId, authorId: chatMessages.userId })
    .from(chatMessages)
    .innerJoin(familyMembers, eq(familyMembers.familyId, chatMessages.familyId))
    .where(and(eq(chatMessages.fileUrl, fileUrl), eq(familyMembers.userId, userId)))
    .limit(1);

  if (!row) return null;

  if (row.authorId !== userId) {
    const blocked = await usersHaveBlockRelationship(userId, row.authorId, row.familyId);
    if (blocked) return null;
  }

  return row.familyId;
}
