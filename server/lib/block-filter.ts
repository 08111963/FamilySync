import { db } from "../db";
import { blocks } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

export async function getBlockedUserIds(userId: string, familyId: string): Promise<string[]> {
  const userBlocks = await db
    .select({ blockedUserId: blocks.blockedUserId })
    .from(blocks)
    .where(and(eq(blocks.blockerUserId, userId), eq(blocks.familyId, familyId)));

  return userBlocks.map((b) => b.blockedUserId);
}
