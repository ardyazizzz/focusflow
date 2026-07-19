export interface Goal {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  _count?: { bottlenecks: number; tasks: number };
}

export interface Bottleneck {
  id: string;
  title: string;
  description: string | null;
  goal_id: string;
  goal?: { id: string; title: string };
  created_at: string;
  updated_at: string;
  _count?: { tasks: number };
}

export interface DimensionOption {
  id: string;
  dimension: string;
  label: string;
  sort_order: number;
}

export interface Task {
  id: string;
  title: string;
  goal_id: string;
  bottleneck_id: string;
  priority_option_id: string;
  impact_option_id: string | null;
  clarity_option_id: string | null;
  time_option_id: string | null;
  deadline: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  goal: { id: string; title: string };
  bottleneck: { id: string; title: string };
  priority_option: DimensionOption;
  impact_option: DimensionOption | null;
  clarity_option: DimensionOption | null;
  time_option: DimensionOption | null;
}

export interface DimensionsData {
  dimensionNames: Record<string, string>;
  options: Record<string, DimensionOption[]>;
}

export interface SettingsData {
  pomodoroDuration: number;
  dimensionName_priority: string;
  dimensionName_impact: string;
  dimensionName_clarity: string;
  dimensionName_time: string;
}
