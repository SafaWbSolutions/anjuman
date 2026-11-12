-- ═══════════════════════════════════════════════════════════════
-- 0040 · Add the 'paused' member status
--
-- Paused means: still a member (all receipts and history stay), but
-- temporarily not billed. It is deliberately separate from 'inactive'
-- (archived/removed) so the office can tell a temporary break from a
-- permanent exit.
--
-- This is its own migration because PostgreSQL does not allow a newly
-- added enum value to be used in the same transaction that adds it.
-- 0041 uses the value.
-- ═══════════════════════════════════════════════════════════════

alter type public.member_status add value if not exists 'paused';
