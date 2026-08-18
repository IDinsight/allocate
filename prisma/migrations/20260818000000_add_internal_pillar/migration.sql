-- Pillar: add Internal (distinct from the pre-existing Admin, which itself
-- was renamed from Internal in migration 20260409000000).
ALTER TYPE "Pillar" ADD VALUE 'Internal';
