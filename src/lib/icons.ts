import {
  Flag, Zap, Eye, Clock, Flame, Star, Crosshair, Lightbulb,
  Puzzle, Rocket, Pin, Link2, Coffee, Leaf, MessageSquare,
  Trophy, Hash, Heart, Umbrella, Sun, Moon, Cloud, Diamond,
  Music, Brush, Target, TriangleAlert, Sparkles, Compass, Gem,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const CUSTOM_LABEL_ICONS: Record<string, LucideIcon> = {
  flag: Flag,
  zap: Zap,
  eye: Eye,
  clock: Clock,
  flame: Flame,
  star: Star,
  crosshair: Crosshair,
  lightbulb: Lightbulb,
  puzzle: Puzzle,
  rocket: Rocket,
  pin: Pin,
  link: Link2,
  coffee: Coffee,
  leaf: Leaf,
  message: MessageSquare,
  trophy: Trophy,
  hash: Hash,
  heart: Heart,
  umbrella: Umbrella,
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  diamond: Diamond,
  music: Music,
  brush: Brush,
  target: Target,
  triangle: TriangleAlert,
  sparkles: Sparkles,
  compass: Compass,
  gem: Gem,
}

export const ICON_PICKER_OPTIONS = Object.keys(CUSTOM_LABEL_ICONS)
