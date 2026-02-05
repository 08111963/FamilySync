import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { families, familyMembers, familyInvites, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { sendFamilyInviteEmail } from '../lib/email';
import { broadcastToFamily } from '../lib/websocket';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// CREATE FAMILY
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, colorTheme } = req.body;
    
    const [family] = await db.insert(families).values({
      name,
      colorTheme: colorTheme || '#6366F1',
    }).returning();
    
    await db.insert(familyMembers).values({
      familyId: family.id,
      userId: req.user!.userId,
      role: 'admin',
      nickname: 'Admin',
      color: '#6366F1',
      points: 0,
    });
    
    res.status(201).json(family);
  } catch (error) {
    console.error('Create family error:', error);
    res.status(500).json({ error: 'Errore nella creazione della famiglia' });
  }
});

// GET MY FAMILIES
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const myFamilies = await db
      .select({
        family: families,
        member: familyMembers,
      })
      .from(familyMembers)
      .innerJoin(families, eq(familyMembers.familyId, families.id))
      .where(eq(familyMembers.userId, req.user!.userId));
    
    res.json(myFamilies.map(f => ({ ...f.family, myRole: f.member.role, myMemberId: f.member.id })));
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero delle famiglie' });
  }
});

// GET FAMILY DETAILS
router.get('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    const membership = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (membership.length === 0) {
      return res.status(403).json({ error: 'Non fai parte di questa famiglia' });
    }
    
    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
    
    if (!family) {
      return res.status(404).json({ error: 'Famiglia non trovata' });
    }
    
    const members = await db
      .select({
        member: familyMembers,
        user: users,
      })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId));
    
    res.json({
      ...family,
      members: members.map(m => ({
        id: m.member.id,
        userId: m.user.id,
        name: m.user.name,
        nickname: m.member.nickname,
        role: m.member.role,
        color: m.member.color,
        points: m.member.points,
        avatarUrl: m.user.avatarUrl,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero della famiglia' });
  }
});

// UPDATE FAMILY
router.put('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    const { name, colorTheme } = req.body;
    
    const membership = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (membership.length === 0 || membership[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono modificare la famiglia' });
    }
    
    const [updatedFamily] = await db.update(families)
      .set({ name, colorTheme, updatedAt: new Date() })
      .where(eq(families.id, familyId))
      .returning();
    
    broadcastToFamily(familyId, 'family_updated', updatedFamily);
    
    res.json(updatedFamily);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento della famiglia' });
  }
});

// CREATE INVITE
router.post('/:familyId/invite', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    const { email, role } = req.body;
    
    const membership = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (membership.length === 0 || membership[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono invitare' });
    }
    
    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
    const [inviter] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    
    await db.insert(familyInvites).values({
      familyId,
      token,
      invitedBy: req.user!.userId,
      role: role || 'adult',
      expiresAt,
    });
    
    if (email) {
      await sendFamilyInviteEmail(email, family.name, inviter.name, token);
    }
    
    res.json({ 
      token, 
      inviteLink: `${process.env.CLIENT_URL}/join/${token}`,
      expiresAt,
    });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Errore nella creazione dell\'invito' });
  }
});

// ACCEPT INVITE
router.post('/join/:token', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { nickname, color } = req.body;
    
    const [invite] = await db.select()
      .from(familyInvites)
      .where(eq(familyInvites.token, token))
      .limit(1);
    
    if (!invite) {
      return res.status(404).json({ error: 'Invito non trovato' });
    }
    
    if (invite.acceptedAt) {
      return res.status(400).json({ error: 'Invito già accettato' });
    }
    
    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ error: 'Invito scaduto' });
    }
    
    const existing = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, invite.familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Fai già parte di questa famiglia' });
    }
    
    const [newMember] = await db.insert(familyMembers).values({
      familyId: invite.familyId,
      userId: req.user!.userId,
      role: invite.role,
      nickname: nickname || 'Membro',
      color: color || '#6366F1',
      points: 0,
    }).returning();
    
    await db.update(familyInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(familyInvites.token, token));
    
    const [family] = await db.select().from(families).where(eq(families.id, invite.familyId)).limit(1);
    
    broadcastToFamily(invite.familyId, 'member_joined', newMember);
    
    res.json({ message: 'Invito accettato!', family });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Errore nell\'accettazione dell\'invito' });
  }
});

// UPDATE MEMBER
router.put('/:familyId/members/:memberId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId, memberId } = req.params;
    const { nickname, color, role } = req.body;
    
    const membership = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (membership.length === 0) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const updateData: any = {};
    if (nickname) updateData.nickname = nickname;
    if (color) updateData.color = color;
    
    if (role && membership[0].role === 'admin') {
      updateData.role = role;
    }
    
    const [updated] = await db.update(familyMembers)
      .set(updateData)
      .where(and(
        eq(familyMembers.id, memberId),
        eq(familyMembers.familyId, familyId)
      ))
      .returning();
    
    broadcastToFamily(familyId, 'member_updated', updated);
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento del membro' });
  }
});

// REMOVE MEMBER
router.delete('/:familyId/members/:memberId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId, memberId } = req.params;
    
    const membership = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (membership.length === 0 || membership[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono rimuovere membri' });
    }
    
    await db.delete(familyMembers)
      .where(and(
        eq(familyMembers.id, memberId),
        eq(familyMembers.familyId, familyId)
      ));
    
    broadcastToFamily(familyId, 'member_removed', { memberId });
    
    res.json({ message: 'Membro rimosso' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nella rimozione del membro' });
  }
});

export default router;
