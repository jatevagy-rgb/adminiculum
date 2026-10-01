-- CreateTable
CREATE TABLE "case_workspace_tiles" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "text" VARCHAR(6000) NOT NULL,
    "tone" VARCHAR(16) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_workspace_tiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_workspace_layouts" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "placements" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_workspace_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_workspace_tiles_caseId_archived_idx" ON "case_workspace_tiles"("caseId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "case_workspace_layouts_caseId_userId_key" ON "case_workspace_layouts"("caseId", "userId");

-- AddForeignKey
ALTER TABLE "case_workspace_tiles" ADD CONSTRAINT "case_workspace_tiles_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_workspace_layouts" ADD CONSTRAINT "case_workspace_layouts_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_workspace_layouts" ADD CONSTRAINT "case_workspace_layouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_workspace_tiles" ADD CONSTRAINT "case_workspace_tiles_values" CHECK ("revision" > 0 AND "kind" = 'TEXT' AND "tone" IN ('info','teal','green') AND length(trim("title")) > 0);
ALTER TABLE "case_workspace_layouts" ADD CONSTRAINT "case_workspace_layouts_values" CHECK ("revision" > 0 AND jsonb_typeof("placements") = 'object' AND jsonb_typeof("placements"->'overview') = 'array' AND jsonb_typeof("placements"->'document') = 'array' AND jsonb_array_length("placements"->'overview') <= 32 AND jsonb_array_length("placements"->'document') <= 32);
