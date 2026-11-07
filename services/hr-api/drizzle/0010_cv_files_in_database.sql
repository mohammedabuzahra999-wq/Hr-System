-- CV files move from the disk into the database.
--
-- The bytes were written under `uploads/YYYY/MM/<uuid>.<ext>`, which is right on
-- a machine that keeps its disk. The hosting this is going to does not: a free
-- instance restarts after fifteen minutes of idleness and comes back with an
-- empty filesystem. The row would survive; the file would not; and the failure
-- would be silent until an HR user clicked a CV and got nothing.
--
-- `stored_path` is kept rather than dropped. Rows written before this migration
-- still point at a real file on the machine they were uploaded to, and
-- `readUpload` falls back to the path when `content` is null — so those rows
-- keep working, and `scripts/migrateCvsIntoDb.ts` moves them across when run.

ALTER TABLE "cv_files" ADD COLUMN IF NOT EXISTS "content" bytea;--> statement-breakpoint
ALTER TABLE "cv_files" ALTER COLUMN "stored_path" SET DEFAULT '';
