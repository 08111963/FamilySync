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

export function applyBlockedFilter(createdByColumn: Column, blockedIds: string[]): SQL | undefined {
  if (blockedIds.length === 0) return undefined;
  return or(isNull(createdByColumn), notInArray(createdByColumn, blockedIds));
}
