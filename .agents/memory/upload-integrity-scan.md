---
name: Upload integrity scan
description: Daily scan detecting DB rows whose file_url/avatar_url point to missing bucket/disk files
---

Daily scheduler verifies chat_messages.file_url, users.avatar_url, bill_attachments.file_url against Object Storage AND local disk (legacy fallback), logs orphans (tag UPLOAD_INTEGRITY) and emails APP_OWNER_EMAILS.

**Rules:**
- Fail-closed: any bucket communication error aborts the scan — never mark rows orphan on infrastructure errors (false positives could trigger wrong cleanups).
- Auto-cleanup is opt-in via `UPLOAD_INTEGRITY_AUTO_CLEAN=true`; default is report-only. Cleanup nulls file_url/avatar_url with a guard on the current value; bill_attachments rows are deleted (file_url NOT NULL).
- External http(s) avatar URLs (Google etc.) are always "ok" — never our files, never touched.
- Malformed /uploads URLs (path traversal, bad chars) count as orphans with reason "invalid": they can never be served.

**Reverse direction (bucket→DB):** the same scan lists bucket objects under `uploads/` and flags files no longer referenced by any row ("forgotten"). `uploads/recipe-images/` is excluded (public cross-family cache, separate lifecycle). Grace period for fresh uploads not yet in DB: the bucket client exposes no object timestamps, so grace is a two-sighting in-memory map (first sighting only tracks; reported/deleted only if still unreferenced after `UPLOAD_INTEGRITY_GRACE_MS`, default 6h). Restart resets the map → reporting can only be delayed, never premature.

**Why:** broken chat attachments were previously discovered manually (see scripts/cleanup-orphan-uploads.sql); forgotten bucket files waste space and may hold personal data that should have been deleted.
