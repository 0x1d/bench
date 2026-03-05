import type { LucideIcon } from 'lucide-react';
import {
  Globe,
  Database,
  LogIn,
  Mail,
  Clock,
  Binary,
  Box,
  GitBranch,
  LogOut,
} from 'lucide-react';

export const flowStepIcons: Record<string, LucideIcon> = {
  http: Globe,
  query: Database,
  input: LogIn,
  output: LogOut,
  message: Mail,
  sleep: Clock,
  transform: Binary,
  container: Box,
  pipeline: GitBranch,
};
