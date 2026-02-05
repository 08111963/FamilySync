# 🚀 FAMILY SYNC - IMPLEMENTAZIONE BACKEND COMPLETO

Sei un Senior Full-Stack Engineer. Devi implementare il backend completo per Family Sync.

**CONTESTO:** Family Sync è un'app di coordinamento familiare. Attualmente funziona solo come prototipo UI con AsyncStorage locale. Devi trasformarla in un'app multi-device, real-time, con AI e payments.

**OBIETTIVO:** Implementare 8 features mancanti in ordine sequenziale.

**REGOLE:**
1. Esegui OGNI sezione nell'ordine indicato
2. TESTA che ogni sezione funzioni prima di procedere
3. NON saltare step
4. Fornisci output dei comandi eseguiti
5. Crea TUTTI i file indicati (non dire "già fatto" se non l'hai fatto)

---

## 📦 SEZIONE 1: DIPENDENZE

Esegui questi comandi:

```bash
cd /workspace/Family-Sync-Coordination

# Backend core
npm install bcryptjs@2.4.3 jsonwebtoken@9.0.2
npm install --save-dev @types/bcryptjs @types/jsonwebtoken

# AI & External Services
npm install openai@4.63.0
npm install stripe@17.3.1
npm install @stripe/stripe-react-native@0.40.2
npm install @sendgrid/mail@8.1.4

# Real-time
npm install socket.io@4.8.1 socket.io-client@4.8.1

# Security & Utils
npm install express-rate-limit@7.5.0 helmet@8.0.0
npm install date-fns@4.1.0 uuid@11.0.3
npm install --save-dev @types/uuid

# Verifica installazione
npm list | grep -E "(bcryptjs|jsonwebtoken|openai|stripe|socket.io)"
```

**OUTPUT ATTESO:** Lista dipendenze installate senza errori.

---

## 🗄️ SEZIONE 2: DATABASE SCHEMA

**File: `shared/schema.ts`** (SOSTITUISCI completamente il file esistente)

```typescript
import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  uuid, 
  timestamp, 
  integer,
  boolean,
  jsonb,
  pgEnum
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["admin", "adult", "teen", "child"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["free", "premium", "canceled"]);
export const eventCategoryEnum = pgEnum("event_category", ["work", "school", "sport", "health", "social", "other"]);
export const choreDifficultyEnum = pgEnum("chore_difficulty", ["easy", "medium", "hard"]);

// USERS
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;

// FAMILIES
export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  colorTheme: varchar("color_theme", { length: 7 }).default("#6366F1"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Family = typeof families.$inferSelect;

// FAMILY MEMBERS
export const familyMembers = pgTable("family_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  nickname: varchar("nickname", { length: 100 }),
  color: varchar("color", { length: 7 }).notNull(),
  points: integer("points").default(0),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type FamilyMember = typeof familyMembers.$inferSelect;

// FAMILY INVITES
export const familyInvites = pgTable("family_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  role: roleEnum("role").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FamilyInvite = typeof familyInvites.$inferSelect;

// CALENDAR EVENTS
export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  date: varchar("date", { length: 10 }).notNull(),
  time: varchar("time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  allDay: boolean("all_day").default(false),
  category: eventCategoryEnum("category").default("other"),
  location: varchar("location", { length: 255 }),
  color: varchar("color", { length: 7 }).notNull(),
  memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;

// SHOPPING LISTS
export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShoppingList = typeof shoppingLists.$inferSelect;

// SHOPPING ITEMS
export const shoppingItems = pgTable("shopping_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => shoppingLists.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  quantity: varchar("quantity", { length: 50 }),
  category: varchar("category", { length: 50 }),
  note: text("note"),
  isChecked: boolean("is_checked").default(false),
  checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
  checkedAt: timestamp("checked_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  position: integer("position").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShoppingItem = typeof shoppingItems.$inferSelect;

// SHOPPING HISTORY (for AI)
export const shoppingHistory = pgTable("shopping_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  quantity: varchar("quantity", { length: 50 }),
  category: varchar("category", { length: 50 }),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
});

export type ShoppingHistoryItem = typeof shoppingHistory.$inferSelect;

// CHORES
export const chores = pgTable("chores", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  difficulty: choreDifficultyEnum("difficulty").default("medium"),
  points: integer("points").default(10),
  estimatedMinutes: integer("estimated_minutes"),
  assignedTo: uuid("assigned_to").references(() => familyMembers.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Chore = typeof chores.$inferSelect;

// AI INSIGHTS
export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  actionData: jsonb("action_data"),
  dismissed: boolean("dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiInsight = typeof aiInsights.$inferSelect;

// EMAIL VERIFICATION TOKENS
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// PASSWORD RESET TOKENS
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Poi esegui:**

```bash
npm run db:push
```

**OUTPUT ATTESO:** "✓ Your database is now in sync with your Drizzle schema"

**Verifica con Drizzle Studio:**

```bash
npx drizzle-kit studio &
```

Dovresti vedere 13 tabelle nel database.

---

## 🔐 SEZIONE 3: AUTENTICAZIONE JWT

**File: `server/lib/jwt.ts`** (NUOVO)

```typescript
import jwt from 'jsonwebtoken';
import type { User } from '../../shared/schema';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';

export interface TokenPayload {
  userId: string;
  email: string;
}

export function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    throw new Error('Invalid token');
  }
}

export function verifyRefreshToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new Error('Invalid refresh token');
  }
}
```

**File: `server/middleware/auth.ts`** (NUOVO)

```typescript
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string; };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

**File: `server/lib/email.ts`** (NUOVO)

```typescript
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
```

---

## 🌐 SEZIONE 4: API ROUTES - AUTENTICAZIONE

**File: `server/routes/auth.ts`** (NUOVO)

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users, emailVerificationTokens, passwordResetTokens } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email';
import { authenticate } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// SIGNUP
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password e nome richiesti' });
    }
    
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email già registrata' });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      name,
      emailVerified: false,
    }).returning();
    
    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6h
    
    await db.insert(emailVerificationTokens).values({
      userId: newUser.id,
      token: verificationToken,
      expiresAt,
    });
    
    await sendVerificationEmail(email, name, verificationToken);
    
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    
    res.status(201).json({
      user: { id: newUser.id, email: newUser.email, name: newUser.name, emailVerified: false },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// LOGIN
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richiesti' });
    }
    
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    res.json({
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// REFRESH TOKEN
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token richiesto' });
    }
    
    const payload = verifyRefreshToken(refreshToken);
    
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    
    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }
    
    const newAccessToken = generateAccessToken(user);
    
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Refresh token non valido' });
  }
});

// ME
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero utente' });
  }
});

// VERIFY EMAIL
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    const [tokenRecord] = await db.select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Token non valido' });
    }
    
    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: 'Token scaduto' });
    }
    
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, tokenRecord.userId));
    
    await db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token));
    
    res.json({ message: 'Email verificata con successo' });
  } catch (error) {
    res.status(500).json({ error: 'Errore durante la verifica' });
  }
});

// REQUEST PASSWORD RESET
router.post('/request-password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      return res.json({ message: 'Se l\'email esiste, riceverai un link' });
    }
    
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
    
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt,
    });
    
    await sendPasswordResetEmail(email, user.name, resetToken);
    
    res.json({ message: 'Se l\'email esiste, riceverai un link' });
  } catch (error) {
    res.status(500).json({ error: 'Errore durante la richiesta' });
  }
});

// RESET PASSWORD
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    
    const [tokenRecord] = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Token non valido' });
    }
    
    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: 'Token scaduto' });
    }
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, tokenRecord.userId));
    
    await db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    
    res.json({ message: 'Password reimpostata con successo' });
  } catch (error) {
    res.status(500).json({ error: 'Errore durante il reset' });
  }
});

export default router;
```

---

## 👨‍👩‍👧‍👦 SEZIONE 5: API ROUTES - FAMILIES

**File: `server/routes/families.ts`** (NUOVO)

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { families, familyMembers, familyInvites, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { sendFamilyInviteEmail } from '../lib/email';
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
    
    res.json(myFamilies.map(f => ({ ...f.family, myRole: f.member.role })));
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
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
    
    await db.insert(familyInvites).values({
      familyId,
      token,
      invitedBy: req.user!.userId,
      role: role || 'adult',
      expiresAt,
    });
    
    await sendFamilyInviteEmail(email, family.name, inviter.name, token);
    
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
    
    await db.insert(familyMembers).values({
      familyId: invite.familyId,
      userId: req.user!.userId,
      role: invite.role,
      nickname: nickname || 'Membro',
      color: color || '#6366F1',
      points: 0,
    });
    
    await db.update(familyInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(familyInvites.token, token));
    
    const [family] = await db.select().from(families).where(eq(families.id, invite.familyId)).limit(1);
    
    res.json({ message: 'Invito accettato!', family });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Errore nell\'accettazione dell\'invito' });
  }
});

export default router;
```

---

## 📅 SEZIONE 6: API ROUTES - CALENDAR, SHOPPING, CHORES

**File: `server/routes/calendar.ts`** (NUOVO)

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { calendarEvents, familyMembers } from '../../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';

const router = Router();

async function checkFamilyAccess(userId: string, familyId: string) {
  const membership = await db.select()
    .from(familyMembers)
    .where(and(
      eq(familyMembers.userId, userId),
      eq(familyMembers.familyId, familyId)
    ))
    .limit(1);
  return membership.length > 0;
}

// GET EVENTS
router.get('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    let query = db.select().from(calendarEvents).where(eq(calendarEvents.familyId, familyId));
    
    if (startDate && endDate) {
      query = query.where(and(
        gte(calendarEvents.date, startDate as string),
        lte(calendarEvents.date, endDate as string)
      ));
    }
    
    const events = await query;
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero eventi' });
  }
});

// CREATE EVENT
router.post('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [event] = await db.insert(calendarEvents).values({
      ...req.body,
      familyId,
      createdBy: req.user!.userId,
    }).returning();
    
    res.status(201).json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Errore nella creazione dell\'evento' });
  }
});

// UPDATE EVENT
router.put('/:familyId/:eventId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId, eventId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [event] = await db.update(calendarEvents)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.familyId, familyId)
      ))
      .returning();
    
    if (!event) {
      return res.status(404).json({ error: 'Evento non trovato' });
    }
    
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento' });
  }
});

// DELETE EVENT
router.delete('/:familyId/:eventId', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId, eventId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    await db.delete(calendarEvents)
      .where(and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.familyId, familyId)
      ));
    
    res.json({ message: 'Evento eliminato' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

export default router;
```

**File: `server/routes/shopping.ts`** (NUOVO) - Implementa analogamente per shopping lists e items

**File: `server/routes/chores.ts`** (NUOVO) - Implementa analogamente per chores

---

## 🔌 SEZIONE 7: WEBSOCKET REAL-TIME

**File: `server/lib/websocket.ts`** (NUOVO)

```typescript
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken } from './jwt';

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:8081',
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const user = verifyAccessToken(token);
      socket.data.userId = user.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.data.userId);
    
    socket.on('join_family', (familyId: string) => {
      socket.join(`family:${familyId}`);
      console.log(`User ${socket.data.userId} joined family ${familyId}`);
    });
    
    socket.on('leave_family', (familyId: string) => {
      socket.leave(`family:${familyId}`);
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.data.userId);
    });
  });

  return io;
}

export function broadcastToFamily(io: SocketIOServer, familyId: string, event: string, data: any) {
  io.to(`family:${familyId}`).emit(event, data);
}
```

**Modifica: `server/index.ts`** - Aggiungi dopo la riga che crea l'app Express:

```typescript
import { setupWebSocket } from './lib/websocket';

// ... dopo registerRoutes ...
const io = setupWebSocket(server);

// Rendi disponibile io in req
app.set('io', io);
```

---

## 🤖 SEZIONE 8: AI FEATURES (OpenAI)

**File: `server/lib/openai.ts`** (NUOVO)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-test',
});

export async function generateShoppingSuggestions(context: {
  familySize: number;
  recentPurchases: string[];
  upcomingEvents: string[];
  season: string;
}) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'You are a family shopping assistant. Suggest grocery items based on context.',
      }, {
        role: 'user',
        content: `Family of ${context.familySize}. Recent purchases: ${context.recentPurchases.join(', ')}. Upcoming events: ${context.upcomingEvents.join(', ')}. Season: ${context.season}. Suggest 10 items they might need. Return JSON array with format: [{"name": "item", "reason": "why"}]`,
      }],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content || '{"items": []}';
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI error:', error);
    return { items: [] };
  }
}

export async function optimizeChoreSchedule(context: {
  members: Array<{ id: string; name: string; points: number; }>;
  chores: Array<{ title: string; estimatedMinutes: number; }>;
  history: Array<{ memberId: string; minutes: number; }>;
}) {
  try {
    const workload = context.members.map(m => ({
      ...m,
      minutesThisWeek: context.history
        .filter(h => h.memberId === m.id)
        .reduce((sum, h) => sum + h.minutes, 0),
    }));
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: 'You are a fair task scheduler. Balance chores among family members.',
      }, {
        role: 'user',
        content: `Members and current workload: ${JSON.stringify(workload)}. Chores to assign: ${JSON.stringify(context.chores)}. Create a fair schedule for next 7 days. Return JSON with format: {"schedule": [{"choreTitle": "...", "assignTo": "memberId", "dueDate": "YYYY-MM-DD"}]}`,
      }],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content || '{"schedule": []}';
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI error:', error);
    return { schedule: [] };
  }
}
```

**File: `server/routes/ai.ts`** (NUOVO)

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { generateShoppingSuggestions, optimizeChoreSchedule } from '../lib/openai';
import { db } from '../db';
import { shoppingHistory, calendarEvents, familyMembers, chores } from '../../shared/schema';
import { eq, gte } from 'drizzle-orm';

const router = Router();

router.post('/:familyId/shopping-suggestions', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const history = await db.select()
      .from(shoppingHistory)
      .where(eq(shoppingHistory.familyId, familyId))
      .where(gte(shoppingHistory.purchasedAt, thirtyDaysAgo));
    
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];
    
    const events = await db.select()
      .from(calendarEvents)
      .where(eq(calendarEvents.familyId, familyId))
      .where(gte(calendarEvents.date, today))
      .where(gte(calendarEvents.date, nextWeekStr));
    
    const members = await db.select()
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));
    
    const suggestions = await generateShoppingSuggestions({
      familySize: members.length,
      recentPurchases: history.map(h => h.itemName),
      upcomingEvents: events.map(e => e.title),
      season: getSeason(),
    });
    
    res.json(suggestions);
  } catch (error) {
    console.error('AI suggestions error:', error);
    res.status(500).json({ error: 'Errore nella generazione suggerimenti' });
  }
});

router.post('/:familyId/optimize-chores', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    const pendingChores = await db.select().from(chores).where(eq(chores.familyId, familyId)).where(eq(chores.isCompleted, false));
    
    const schedule = await optimizeChoreSchedule({
      members: members.map(m => ({ id: m.id, name: m.nickname || 'Member', points: m.points || 0 })),
      chores: pendingChores.map(c => ({ title: c.title, estimatedMinutes: c.estimatedMinutes || 30 })),
      history: [],
    });
    
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'ottimizzazione' });
  }
});

function getSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

export default router;
```

---

## 💳 SEZIONE 9: STRIPE PAYMENTS

**File: `server/lib/stripe.ts`** (NUOVO)

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_', {
  apiVersion: '2024-12-18.acacia',
});

export default stripe;
```

**File: `server/routes/payments.ts`** (NUOVO)

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import stripe from '../lib/stripe';
import { db } from '../db';
import { families, familyMembers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

router.post('/create-checkout', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.body;
    
    const membership = await db.select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, req.user!.userId)
      ))
      .limit(1);
    
    if (membership.length === 0 || membership[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono sottoscrivere' });
    }
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/subscription/cancel`,
      metadata: { familyId },
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Errore nella creazione del checkout' });
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    return res.status(400).send('Missing signature');
  }
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
    
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const familyId = session.metadata?.familyId;
        
        if (familyId && session.subscription) {
          await db.update(families)
            .set({
              subscriptionStatus: 'premium',
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
            })
            .where(eq(families.id, familyId));
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        await db.update(families)
          .set({ subscriptionStatus: 'free' })
          .where(eq(families.stripeSubscriptionId, subscription.id));
        break;
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Webhook error');
  }
});

export default router;
```

---

## 🔗 SEZIONE 10: REGISTRA TUTTE LE ROUTES

**Modifica: `server/routes.ts`** (SOSTITUISCI completamente)

```typescript
import type { Express } from "express";
import { createServer, type Server } from "node:http";
import authRoutes from './routes/auth';
import familiesRoutes from './routes/families';
import calendarRoutes from './routes/calendar';
import shoppingRoutes from './routes/shopping';
import choresRoutes from './routes/chores';
import aiRoutes from './routes/ai';
import paymentsRoutes from './routes/payments';

export async function registerRoutes(app: Express): Promise<Server> {
  app.use('/api/auth', authRoutes);
  app.use('/api/families', familiesRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/shopping', shoppingRoutes);
  app.use('/api/chores', choresRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/payments', paymentsRoutes);

  const httpServer = createServer(app);
  return httpServer;
}
```

---

## ✅ SEZIONE 11: TEST COMPLETO

Esegui questi test per verificare che tutto funzioni:

```bash
# 1. Avvia il server
npm run server:dev
```

**In un altro terminale, testa le API:**

```bash
# Test signup
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Salva il token dalla risposta, poi:

# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test /me (usa il token dalla risposta)
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Test create family
curl -X POST http://localhost:5000/api/families \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Famiglia Test","colorTheme":"#6366F1"}'

# Salva il familyId dalla risposta, poi:

# Test create event
curl -X POST http://localhost:5000/api/calendar/YOUR_FAMILY_ID \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Event","date":"2026-02-10","color":"#6366F1"}'
```

**OUTPUT ATTESO:**
- ✅ Signup: 201 con token
- ✅ Login: 200 con token
- ✅ /me: 200 con dati utente
- ✅ Create family: 201 con famiglia creata
- ✅ Create event: 201 con evento creato

---

## 📱 SEZIONE 12: CLIENT MIGRATION (BONUS)

Ora che il backend funziona, modifica il client per usare le API invece di AsyncStorage.

**File: `lib/api.ts`** (NUOVO nel client)

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          await SecureStore.setItemAsync('accessToken', data.accessToken);
          error.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return axios(error.config);
        } catch {
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('refreshToken');
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## 🎉 DELIVERABLE FINALE

Dopo aver completato TUTTE le sezioni, fornisci:

1. ✅ Screenshot di Drizzle Studio con 13 tabelle
2. ✅ Output dei test curl che funzionano
3. ✅ Server in running su http://localhost:5000
4. ✅ Conferma che WebSocket è attivo sulla porta 8080
5. ✅ Log di una chiamata OpenAI andata a buon fine (anche mock)
6. ✅ Conferma che Stripe checkout redirect funziona

**IMPORTANTE:** NON procedere alla sezione successiva se quella precedente ha errori. Debug e risolvi prima di continuare.

---

## 📝 NOTE FINALI

- Se SendGrid non è configurato, le email verranno loggarte in console (modalità DEV)
- Se OpenAI non è configurato, le funzioni AI ritorneranno array vuoti
- Se Stripe non è configurato, i pagamenti non funzioneranno ma non crasheranno
- WebSocket richiede che il client si connetta con un token JWT valido

**TUTTO COMPLETATO!** 🚀

Ora hai:
- ✅ Database multi-utente
- ✅ Autenticazione JWT completa
- ✅ API REST per tutte le features
- ✅ WebSocket real-time
- ✅ AI integration (OpenAI)
- ✅ Payments (Stripe)
- ✅ Email system (SendGrid)
- ✅ Inviti famiglia

**Il backend è completo e production-ready!**
