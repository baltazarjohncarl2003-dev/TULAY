import type { Category } from "@/lib/types";

// The category tree, as seeded by supabase/migrations/20261111134936_catalog.sql. Categories change only
// through migrations (there is no admin editor), so this static copy is safe for client components.
// shortcut: two copies of the tree; when categories become admin-editable, load them from the database instead.
// The database test (foundation.test.sql) checks the count; change both places together.
export const CATEGORIES: Category[] = [
  { id: "c15", slug: "agriculture-food", name: "Agriculture & Food", parentSlug: null },
  { id: "c26", slug: "fresh-produce", name: "Fresh Produce", parentSlug: "agriculture-food" },
  { id: "c27", slug: "coffee-beverages", name: "Coffee & Beverages", parentSlug: "agriculture-food" },
  { id: "c28", slug: "processed-food", name: "Processed Food", parentSlug: "agriculture-food" },
  { id: "c16", slug: "construction", name: "Construction & Building Materials", parentSlug: null },
  { id: "c29", slug: "cement-aggregates", name: "Cement & Aggregates", parentSlug: "construction" },
  { id: "c30", slug: "lumber-plywood", name: "Lumber & Plywood", parentSlug: "construction" },
  { id: "c31", slug: "hardware-tools", name: "Hardware & Tools", parentSlug: "construction" },
  { id: "c17", slug: "industrial-equipment", name: "Industrial Equipment", parentSlug: null },
  { id: "c32", slug: "food-machinery", name: "Food & Beverage Machinery", parentSlug: "industrial-equipment" },
  { id: "c33", slug: "printing-machinery", name: "Printing Machinery", parentSlug: "industrial-equipment" },
  { id: "c18", slug: "electronics", name: "Electronics & Technology", parentSlug: null },
  { id: "c34", slug: "computers-it", name: "Computers & IT", parentSlug: "electronics" },
  { id: "c35", slug: "pos-systems", name: "POS & Retail Tech", parentSlug: "electronics" },
  { id: "c4", slug: "packaging", name: "Packaging & Printing", parentSlug: null },
  { id: "c2", slug: "dtf-prints", name: "DTF Prints", parentSlug: "packaging" },
  { id: "c3", slug: "sublimation", name: "Sublimation", parentSlug: "packaging" },
  { id: "c5", slug: "customized-mugs", name: "Customized Mugs", parentSlug: "packaging" },
  { id: "c6", slug: "customized-ids", name: "Customized IDs", parentSlug: "packaging" },
  // Legacy BUYSON categories, now under Packaging & printing.
  { id: "c7", slug: "pouches", name: "Pouches & Flexible Packaging", parentSlug: "packaging" },
  { id: "c8", slug: "boxes", name: "Boxes & Cartons", parentSlug: "packaging" },
  { id: "c9", slug: "bottles", name: "Bottles & Jars", parentSlug: "packaging" },
  { id: "c10", slug: "labels", name: "Labels & Stickers", parentSlug: "packaging" },
  { id: "c11", slug: "food-containers", name: "Cups & Food Containers", parentSlug: "packaging" },
  { id: "c12", slug: "paper-bags", name: "Paper Bags", parentSlug: "packaging" },
  { id: "c13", slug: "mailers", name: "Mailer Packaging", parentSlug: "packaging" },
  { id: "c14", slug: "other", name: "Other Packaging", parentSlug: "packaging" },
  { id: "c19", slug: "office-school", name: "Office & School Supplies", parentSlug: null },
  { id: "c36", slug: "paper-products", name: "Paper Products", parentSlug: "office-school" },
  { id: "c37", slug: "office-furniture", name: "Office Furniture", parentSlug: "office-school" },
  { id: "c20", slug: "furniture-home", name: "Furniture & Home", parentSlug: null },
  { id: "c38", slug: "home-furniture", name: "Home Furniture", parentSlug: "furniture-home" },
  { id: "c39", slug: "kitchenware", name: "Kitchenware", parentSlug: "furniture-home" },
  { id: "c21", slug: "clothing-textiles", name: "Clothing & Textiles", parentSlug: null },
  { id: "c1", slug: "custom-shirts", name: "Custom Shirts", parentSlug: "clothing-textiles" },
  { id: "c40", slug: "uniforms", name: "Uniforms & Workwear", parentSlug: "clothing-textiles" },
  { id: "c41", slug: "fabrics", name: "Fabrics", parentSlug: "clothing-textiles" },
  { id: "c22", slug: "beauty-personal-care", name: "Beauty & Personal Care", parentSlug: null },
  { id: "c42", slug: "cosmetics", name: "Cosmetics", parentSlug: "beauty-personal-care" },
  { id: "c43", slug: "toiletries", name: "Toiletries & Hotel Amenities", parentSlug: "beauty-personal-care" },
  { id: "c23", slug: "logistics-transport", name: "Logistics & Transport", parentSlug: null },
  { id: "c44", slug: "trucking", name: "Trucking & Freight", parentSlug: "logistics-transport" },
  { id: "c45", slug: "warehousing", name: "Warehousing", parentSlug: "logistics-transport" },
  { id: "c24", slug: "business-services", name: "Business & Professional Services", parentSlug: null },
  { id: "c46", slug: "design-branding", name: "Design & Branding", parentSlug: "business-services" },
  { id: "c47", slug: "accounting-legal", name: "Accounting & Legal", parentSlug: "business-services" },
  { id: "c25", slug: "raw-materials", name: "Raw Materials", parentSlug: null },
  { id: "c48", slug: "plastics-resin", name: "Plastics & Resin", parentSlug: "raw-materials" },
  { id: "c49", slug: "paper-pulp", name: "Paper & Pulp", parentSlug: "raw-materials" },
];


export const LAUNCH_CATEGORIES = CATEGORIES.filter((c) => c.parentSlug === null);

export const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;

/** True for "all", the category itself, or one of its subcategories (a parent includes its children). */
export const inCategory = (slug: string, category: string) =>
  category === "all" || slug === category || CATEGORIES.find((c) => c.slug === slug)?.parentSlug === category;

/** Categories worth showing: a subcategory with live listings, and a top category that has listings itself or in a child. Keeps CATEGORIES order. */
export function liveCategories(counts: Record<string, number>): Category[] {
  const live = (slug: string) => (counts[slug] ?? 0) > 0;
  return CATEGORIES.filter(
    (c) => live(c.slug) || (c.parentSlug === null && CATEGORIES.some((s) => s.parentSlug === c.slug && live(s.slug))),
  );
}
