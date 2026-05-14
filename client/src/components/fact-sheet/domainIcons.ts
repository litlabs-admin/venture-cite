// client/src/components/fact-sheet/domainIcons.ts
import {
  User,
  Package,
  Target,
  Users,
  MapPin,
  BadgeCheck,
  TrendingUp,
  Phone,
  FileText,
  type LucideIcon,
} from "lucide-react";

export const DOMAINS = [
  "identity",
  "offerings",
  "positioning",
  "team",
  "operations",
  "credentials",
  "growth",
  "contact",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_ICONS: Record<Domain, LucideIcon> = {
  identity: User,
  offerings: Package,
  positioning: Target,
  team: Users,
  operations: MapPin,
  credentials: BadgeCheck,
  growth: TrendingUp,
  contact: Phone,
};

export const DOMAIN_LABELS: Record<Domain, string> = {
  identity: "Identity",
  offerings: "Offerings",
  positioning: "Positioning",
  team: "Team",
  operations: "Operations",
  credentials: "Credentials",
  growth: "Growth",
  contact: "Contact",
};

export function iconForDomain(domain: string): LucideIcon {
  return (DOMAIN_ICONS as Record<string, LucideIcon>)[domain] ?? FileText;
}
