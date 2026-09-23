-- CreateEnum
CREATE TYPE "FocusArea" AS ENUM ('AI-enabled Dashboards', 'Public-Participation', 'Education', 'CHW AI', 'Benefits AI', 'Ecosystem', 'Not a focus area');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "focusArea" "FocusArea";
