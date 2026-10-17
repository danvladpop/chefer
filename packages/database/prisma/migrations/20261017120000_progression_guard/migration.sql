-- Progression guard (simple training mode §6.5, 2026-10-17): additive.
-- false = ticked "done" with the prefilled numbers never edited (load not
-- confirmed; progression ignores it). null = confirmed (every existing row).
ALTER TABLE "session_sets" ADD COLUMN "loadConfirmed" BOOLEAN;
