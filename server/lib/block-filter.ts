import { db } from "../db";
import { blocks } from "../../shared/schema";
import { eq, and, or, isNull, notInArray, type SQL, type Column } from "drizzle-orm";

export async function getBlockedUserIds(userId: string, familyId: string): Promise<string[]> {
  const userBlocks = await db
    .select({ blockedUserId: blocks.blockedUserId })
    .from(blocks)
    .where(and(eq(blocks.blockerUserId, userId), eq(blocks.familyId, familyId)));

  return userBlocks.map((b) => b.blockedUserId);
}

export async function getBlockRelatedUserIds(userId: string, familyId: string): Promise<string[]> {
  const rows = await db
    .select({ blockerUserId: blocks.blockerUserId, blockedUserId: blocks.blockedUserId })
    .from(blocks)
    .where(
      and(
        eq(blocks.familyId, familyId),
        or(eq(blocks.blockerUserId, userId), eq(blocks.blockedUserId, userId))
      )
    );

  const related = new Set<string>();
  for (const r of rows) {
    const other = r.blockerUserId === userId ? r.blockedUserId : r.blockerUserId;
    if (other !== userId) related.add(other);
  }
  return Array.from(related);
}

export function applyBlockedFilter(createdByColumn: Column, blockedIds: string[]): SQL | undefined {
  if (blockedIds.length === 0) return undefined;
  return or(isNull(createdByColumn), notInArray(createdByColumn, blockedIds));
}
