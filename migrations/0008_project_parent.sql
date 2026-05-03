-- 0008 — Sub-project support: optional parent_project_id on projects.
-- Single-level only (API rejects nested chains). on delete set null so
-- deleting a parent leaves its sub-projects intact.

ALTER TABLE "projects"
  ADD COLUMN "parent_project_id" integer
  REFERENCES "projects"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_projects_parent_project_id"
  ON "projects" ("parent_project_id");
