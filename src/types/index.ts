export interface Goal {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  bottlenecks?: Bottleneck[];
  _count?: { bottlenecks: number; tasks: number };
}

export interface Bottleneck {
  id: string;
  title: string;
  description: string | null;
  goalId: string;
  goal?: { id: string; title: string };
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
  _count?: { tasks: number };
}

export interface DimensionOption {
  id: string;
  dimension: string;
  label: string;
  sortOrder: number;
}

export interface Task {
  id: string;
  title: string;
  goalId: string;
  bottleneckId: string;
  priorityOptionId: string;
  impactOptionId: string | null;
  clarityOptionId: string | null;
  timeOptionId: string | null;
  deadline: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  goal: { id: string; title: string };
  bottleneck: { id: string; title: string };
  priorityOption: DimensionOption;
  impactOption: DimensionOption | null;
  clarityOption: DimensionOption | null;
  timeOption: DimensionOption | null;
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