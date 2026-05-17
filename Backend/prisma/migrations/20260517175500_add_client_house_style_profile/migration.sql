CREATE TABLE "client_house_style_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "officialName" TEXT,
    "shortName" TEXT,
    "registeredSeat" TEXT,
    "taxNumber" TEXT,
    "registrationNumber" TEXT,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "preferredLanguage" TEXT,
    "documentLanguageMode" TEXT,
    "fontFamily" TEXT,
    "fontSize" TEXT,
    "headingStyle" TEXT,
    "numberingStyle" TEXT,
    "headerRequirements" TEXT,
    "footerRequirements" TEXT,
    "signatureBlock" TEXT,
    "headerAssetPath" TEXT,
    "headerDescription" TEXT,
    "brandingNotes" TEXT,
    "bilingualNotes" TEXT,
    "translationNotes" TEXT,
    "preferredTone" TEXT,
    "prohibitedWording" TEXT,
    "reusablePromptInstructions" TEXT,
    "wordFormattingInstructions" TEXT,
    "externalAiInstructions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_house_style_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_house_style_profiles_clientId_key" ON "client_house_style_profiles"("clientId");

ALTER TABLE "client_house_style_profiles" ADD CONSTRAINT "client_house_style_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
