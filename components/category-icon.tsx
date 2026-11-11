import {
  BriefcaseIcon,
  CpuIcon,
  FactoryIcon,
  HardHatIcon,
  LayersIcon,
  NotebookPenIcon,
  PackageIcon,
  ShirtIcon,
  SofaIcon,
  SparklesIcon,
  TruckIcon,
  WheatIcon,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES } from "@/lib/demo/data";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "agriculture-food": WheatIcon,
  construction: HardHatIcon,
  "industrial-equipment": FactoryIcon,
  electronics: CpuIcon,
  packaging: PackageIcon,
  "office-school": NotebookPenIcon,
  "furniture-home": SofaIcon,
  "clothing-textiles": ShirtIcon,
  "beauty-personal-care": SparklesIcon,
  "logistics-transport": TruckIcon,
  "business-services": BriefcaseIcon,
  "raw-materials": LayersIcon,
};

/** Top-level slug for any category slug (children map to their parent). */
export function topCategory(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.parentSlug ?? slug;
}

/** Decorative icon for a category or any of its children. */
export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[topCategory(slug)] ?? PackageIcon;
  return <Icon aria-hidden="true" className={cn("size-5", className)} />;
}
