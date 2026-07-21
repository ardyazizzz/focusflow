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

export interface CustomLabel {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  created_at: string;
  options?: CustomLabelOption[];
}

export interface CustomLabelOption {
  id: string;
  label_id: string;
  value: string;
  sort_order: number;
}

export interface Task {
  id: string;
  title: string;
  goal_id: string | null;
  bottleneck_id: string | null;
  deadline: string | null;
  notes: string | null;
  status: string;
  queue_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  custom_values: Record<string, string[]> | null;
  goal: { id: string; title: string } | null;
  bottleneck: { id: string; title: string } | null;
}

export interface DimensionsData {
  dimensionNames: Record<string, string>;
  options: Record<string, DimensionOption[]>;
}

export interface CustomLabelsData {
  labels: CustomLabel[];
  options: Record<string, CustomLabelOption[]>;
}

export interface SettingsData {
  pomodoroDuration: number;
}
