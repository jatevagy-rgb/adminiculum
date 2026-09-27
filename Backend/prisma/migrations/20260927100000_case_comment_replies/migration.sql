-- Case note replies: additive self-reference on comments.
-- One nullable parentId column + self-referencing foreign key (SET NULL so
-- deleting a parent never destroys its replies) + one index.
-- No backfill, no destructive statements, no reinterpretation of existing rows:
-- every pre-existing comment stays top-level (parentId NULL).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comments'
      AND column_name = 'parentId'
  ) THEN
    ALTER TABLE "comments" ADD COLUMN "parentId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_parentId_fkey') THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "comments_parentId_idx" ON "comments"("parentId");
