---
name: Premium gating is cosmetic
description: How "Premium"/locked-feature confusion arises in FamilySync and how access actually works
---

# Premium features are NOT gated

- **No real paywall exists** anywhere: neither backend routes/middleware nor frontend block AI, members, real-time sync, recipes, etc. The only AI gate is the GDPR `users.aiFeaturesEnabled` toggle (ai-guard middleware), unrelated to payments.
- `app/premium.tsx` is a **marketing/upsell screen only**. When `paymentsEnabled` is false (Stripe payments disabled by default), it shows "Presto disponibile! Ecco cosa avrai". Users mistake this for features being locked.

## Rule: to present "everything unlocked" for a family, set its subscription_status
- **Why:** an admin user repeatedly read the Premium "coming soon" screen as a lock even though all features worked.
- **How to apply:** the premium screen treats a family as subscribed when `currentFamily.subscriptionStatus` is one of `premium|active|trialing` (OR-ed with the Stripe subscription status), which switches the hero to "Sei Premium / accesso completo" and hides the coming-soon block even with payments disabled. `/api/families` already returns `subscriptionStatus` (spread of the family row); `FamilyInfo` includes it. The `subscription_status` pg enum allows premium/active/trialing among others.
