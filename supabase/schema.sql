-- FocusFlow Supabase Schema
-- Run this SQL in your Supabase project SQL editor

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE "Goal" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Bottleneck" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  "goalId" TEXT NOT NULL REFERENCES "Goal"(id) ON DELETE CASCADE,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "ExecutionDimensionOption" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dimension TEXT NOT NULL,
  label TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Task" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  "goalId" TEXT NOT NULL REFERENCES "Goal"(id) ON DELETE CASCADE,
  "bottleneckId" TEXT NOT NULL REFERENCES "Bottleneck"(id) ON DELETE CASCADE,
  "priorityOptionId" TEXT NOT NULL REFERENCES "ExecutionDimensionOption"(id),
  "impactOptionId" TEXT REFERENCES "ExecutionDimensionOption"(id),
  "clarityOptionId" TEXT REFERENCES "ExecutionDimensionOption"(id),
  "timeOptionId" TEXT REFERENCES "ExecutionDimensionOption"(id),
  deadline TIMESTAMPTZ,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ
);

CREATE TABLE "AppSetting" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. AUTO-UPDATE updatedAt TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE TRIGGER set_Goal_updatedAt BEFORE UPDATE ON "Goal"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_Bottleneck_updatedAt BEFORE UPDATE ON "Bottleneck"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_ExecutionDimensionOption_updatedAt BEFORE UPDATE ON "ExecutionDimensionOption"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_Task_updatedAt BEFORE UPDATE ON "Task"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_AppSetting_updatedAt BEFORE UPDATE ON "AppSetting"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. GRANT TABLE ACCESS TO DATA API ROLES
-- ============================================================
-- This makes tables visible to the Supabase Data (REST) API.
-- Without this, the API returns 404 / permission denied.

GRANT ALL ON "Goal" TO anon, authenticated;
GRANT ALL ON "Bottleneck" TO anon, authenticated;
GRANT ALL ON "ExecutionDimensionOption" TO anon, authenticated;
GRANT ALL ON "Task" TO anon, authenticated;
GRANT ALL ON "AppSetting" TO anon, authenticated;

-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bottleneck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutionDimensionOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================
-- FocusFlow is a single-user personal app. The anon key is used
-- directly from the browser (like Swipe.ardy). RLS policies allow
-- full CRUD for both anon and authenticated roles.

CREATE POLICY "anon_all_Goal" ON "Goal" FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_Goal" ON "Goal" FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_Bottleneck" ON "Bottleneck" FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_Bottleneck" ON "Bottleneck" FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_ExecutionDimensionOption" ON "ExecutionDimensionOption"
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_ExecutionDimensionOption" ON "ExecutionDimensionOption"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_Task" ON "Task" FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_Task" ON "Task" FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_AppSetting" ON "AppSetting" FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_AppSetting" ON "AppSetting" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6. SEED DEFAULT DATA
-- ============================================================

INSERT INTO "ExecutionDimensionOption" (dimension, label, "sortOrder") VALUES
  ('priority', 'P1 - Critical', 1),
  ('priority', 'P2 - High', 2),
  ('priority', 'P3 - Medium', 3),
  ('priority', 'P4 - Low', 4),
  ('impact', 'Transformational', 1),
  ('impact', 'Significant', 2),
  ('impact', 'Moderate', 3),
  ('impact', 'Minimal', 4),
  ('clarity', 'Crystal Clear', 1),
  ('clarity', 'Mostly Clear', 2),
  ('clarity', 'Vague', 3),
  ('clarity', 'Unknown', 4),
  ('time', 'Immediate (< 2h)', 1),
  ('time', 'Soon (today)', 2),
  ('time', 'This week', 3),
  ('time', 'Flexible', 4);

INSERT INTO "AppSetting" (key, value) VALUES
  ('pomodoroDuration', '25'),
  ('dimensionName_priority', 'Priority'),
  ('dimensionName_impact', 'Impact'),
  ('dimensionName_clarity', 'Clarity'),
  ('dimensionName_time', 'Time');
