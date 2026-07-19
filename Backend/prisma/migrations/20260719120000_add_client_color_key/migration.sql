-- CreateEnum
CREATE TYPE "ClientColorKey" AS ENUM ('RED', 'ORANGE', 'AMBER', 'GREEN', 'TEAL', 'BLUE', 'INDIGO', 'PURPLE', 'ROSE', 'SLATE');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "colorKey" "ClientColorKey";
