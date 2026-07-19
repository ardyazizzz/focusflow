-- FocusFlow Supabase Schema - Run in Supabase SQL Editor

DROP TABLE IF EXISTS "Task" CASCADE;
DROP TABLE IF EXISTS "Bottleneck" CASCADE;
DROP TABLE IF EXISTS "Goal" CASCADE;
DROP TABLE IF EXISTS "ExecutionDimensionOption" CASCADE;
DROP TABLE IF EXISTS "AppSetting" CASCADE;

CREATE TABLE goals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bottlenecks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE execution_dimension_options (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dimension TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
  bottleneck_id TEXT REFERENCES bottlenecks(id) ON DELETE CASCADE,
  priority_option_id TEXT NOT NULL REFERENCES execution_dimension_options(id),
  impact_option_id TEXT REFERENCES execution_dimension_options(id),
  clarity_option_id TEXT REFERENCES execution_dimension_options(id),
  time_option_id TEXT REFERENCES execution_dimension_options(id),
  deadline TIMESTAMPTZ,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE app_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE TRIGGER set_goals_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_bottlenecks_updated_at BEFORE UPDATE ON bottlenecks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_execution_dimension_options_updated_at BEFORE UPDATE ON execution_dimension_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON goals TO anon, authenticated;
GRANT ALL ON bottlenecks TO anon, authenticated;
GRANT ALL ON execution_dimension_options TO anon, authenticated;
GRANT ALL ON tasks TO anon, authenticated;
GRANT ALL ON app_settings TO anon, authenticated;

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottlenecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_dimension_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_goals" ON goals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_goals" ON goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bottlenecks" ON bottlenecks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_bottlenecks" ON bottlenecks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_execution_dimension_options" ON execution_dimension_options FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_execution_dimension_options" ON execution_dimension_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_tasks" ON tasks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_tasks" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_app_settings" ON app_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_app_settings" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO execution_dimension_options (dimension, label, sort_order) VALUES
  ('priority', 'P1 - Critical', 1), ('priority', 'P2 - High', 2),
  ('priority', 'P3 - Medium', 3), ('priority', 'P4 - Low', 4),
  ('impact', 'Transformational', 1), ('impact', 'Significant', 2),
  ('impact', 'Moderate', 3), ('impact', 'Minimal', 4),
  ('clarity', 'Crystal Clear', 1), ('clarity', 'Mostly Clear', 2),
  ('clarity', 'Vague', 3), ('clarity', 'Unknown', 4),
  ('time', 'Immediate (< 2h)', 1), ('time', 'Soon (today)', 2),
  ('time', 'This week', 3), ('time', 'Flexible', 4);

INSERT INTO app_settings (key, value) VALUES
  ('pomodoroDuration', '25'),
  ('dimensionName_priority', 'Priority'),
  ('dimensionName_impact', 'Impact'),
  ('dimensionName_clarity', 'Clarity'),
  ('dimensionName_time', 'Time');
