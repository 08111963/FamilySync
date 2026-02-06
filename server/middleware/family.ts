import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { familyMembers } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

export function requireFamilyMember(paramName = "familyId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const familyId = req.params[paramName] || req.body?.familyId;

    if (!familyId || typeof familyId !== "string") {
      return res.status(400).json({
        error: { code: "MISSING_FAMILY_ID", message: "familyId è obbligatorio" },
      });
    }

    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, req.user!.userId),
          eq(familyMembers.familyId, familyId)
        )
      )
      .limit(1);

    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" },
      });
    }

    (req as any).membership = membership;
    next();
  };
}

export function requireFamilyAdmin(paramName = "familyId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const familyId = req.params[paramName] || req.body?.familyId;

    if (!familyId || typeof familyId !== "string") {
      return res.status(400).json({
        error: { code: "MISSING_FAMILY_ID", message: "familyId è obbligatorio" },
      });
    }

    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, req.user!.userId),
          eq(familyMembers.familyId, familyId)
        )
      )
      .limit(1);

    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" },
      });
    }

    if (membership.role !== "admin") {
      return res.status(403).json({
        error: { code: "NOT_ADMIN", message: "Solo gli admin possono eseguire questa azione" },
      });
    }

    (req as any).membership = membership;
    next();
  };
}
