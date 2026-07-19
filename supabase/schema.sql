-- FocusFlow Supabase Schema
-- Run this SQL in your Supabase project SQL editor

-- Goals table
CREATE TABLE "Goal" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bottlenecks table
CREATE TABLE "Bottleneck" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  "goalId" TEXT NOT NULL REFERENCES "Goal"(id) ON DELETE CASCADE,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Execution Dimension Options table
CREATE TABLE "ExecutionDimensionOption" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dimension TEXT NOT NULL,
  label TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks table
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

-- App Settings table
CREATE TABLE "AppSetting" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default execution dimension options
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

-- Insert default app settings
INSERT INTO "AppSetting" (key, value) VALUES
  ('pomodoroDuration', '25'),
  ('dimensionName_priority', 'Priority'),
  ('dimensionName_impact', 'Impact'),
  ('dimensionName_clarity', 'Clarity'),
  ('dimensionName_time', 'Time');
