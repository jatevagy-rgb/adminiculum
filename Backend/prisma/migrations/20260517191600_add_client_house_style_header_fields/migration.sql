ALTER TABLE "client_house_style_profiles"
ADD COLUMN IF NOT EXISTS "headerAssetPath" TEXT;

ALTER TABLE "client_house_style_profiles"
ADD COLUMN IF NOT EXISTS "headerDescription" TEXT;

ALTER TABLE "client_house_style_profiles"
ADD COLUMN IF NOT EXISTS "brandingNotes" TEXT;