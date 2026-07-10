---
name: Bill custom reminders (date+time)
description: Format and scheduling rules for user-picked custom bill reminders
---

Custom bill reminders let the user pick day AND time.

- Stored in `custom_reminder_dates` (jsonb string[]) as local `YYYY-MM-DDTHH:MM` (no tz, no seconds). No DB migration needed to add time — same column.
- Backward-compat: legacy date-only `YYYY-MM-DD` entries are still valid and fire at 08:00 (NOTIFY_HOUR). Any validator/parser MUST accept both forms.
- Client (`lib/bill-notifications.ts`) is the ONLY thing that schedules local notifications; server `computeBillReminders` (display) does NOT include custom reminders — the add-bill edit screen chips are the user's confirmation instead.
- Custom triggers fire at the exact chosen instant, skip past instants, and dedupe by exact timestamp (not by day — the old day-dedup caused same-day-after-08:00 reminders to be silently dropped).

**Why:** original bug — every custom reminder fired at 08:00, so one added the same day after 08:00 was already in the past → no notification.

**How to apply:** FE and BE validation must stay in lockstep (both use an `isRealReminderValue` that accepts date or date+time). Any change to NOTIFY_HOUR/offsets/format must bump `SCHEDULE_POLICY_VERSION` in `lib/bill-notifications.ts` (it's part of the signature) so already-scheduled notifications get reprogrammed.
