import type { Category } from "@/lib/demo/types";

// The category tree, as seeded by supabase/migrations/20261111134936_catalog.sql. Categories change only
// through migrations (there is no admin editor), so this static copy is safe for client components.
// shortcut: two copies of the tree; when categories become admin-editable, load them from the database instead.
// The database test (foundation.test.sql) checks the count; change both places together.
export const CATEGORIES: Category[] = [
  { id: "c15", slug: "agriculture-food", name: "Agriculture & food", parentSlug: null },
  { id: "c26", slug: "fresh-produce", name: "Fresh produce", parentSlug: "agriculture-food" },
  { id: "c27", slug: "coffee-beverages", name: "Coffee & beverages", parentSlug: "agriculture-food" },
  { id: "c28", slug: "processed-food", name: "Processed food", parentSlug: "agriculture-food" },
  { id: "c16", slug: "construction", name: "Construction & building materials", parentSlug: null },
  { id: "c29", slug: "cement-aggregates", name: "Cement & aggregates", parentSlug: "construction" },
  { id: "c30", slug: "lumber-plywood", name: "Lumber & plywood", parentSlug: "construction" },
  { id: "c31", slug: "hardware-tools", name: "Hardware & tools", parentSlug: "construction" },
  { id: "c17", slug: "industrial-equipment", name: "Industrial equipment", parentSlug: null },
  { id: "c32", slug: "food-machinery", name: "Food & beverage machinery", parentSlug: "industrial-equipment" },
  { id: "c33", slug: "printing-machinery", name: "Printing machinery", parentSlug: "industrial-equipment" },
  { id: "c18", slug: "electronics", name: "Electronics & technology", parentSlug: null },
  { id: "c34", slug: "computers-it", name: "Computers & IT", parentSlug: "electronics" },
  { id: "c35", slug: "pos-systems", name: "POS & retail tech", parentSlug: "electronics" },
  { id: "c4", slug: "packaging", name: "Packaging & printing", parentSlug: null },
  { id: "c2", slug: "dtf-prints", name: "DTF prints", parentSlug: "packaging" },
  { id: "c3", slug: "sublimation", name: "Sublimation", parentSlug: "packaging" },
  { id: "c5", slug: "customized-mugs", name: "Customized mugs", parentSlug: "packaging" },
  { id: "c6", slug: "customized-ids", name: "Customized IDs", parentSlug: "packaging" },
  // Legacy BUYSON categories, now under Packaging & printing.
  { id: "c7", slug: "pouches", name: "Pouches & flexible packaging", parentSlug: "packaging" },
  { id: "c8", slug: "boxes", name: "Boxes & cartons", parentSlug: "packaging" },
  { id: "c9", slug: "bottles", name: "Bottles & jars", parentSlug: "packaging" },
  { id: "c10", slug: "labels", name: "Labels & stickers", parentSlug: "packaging" },
  { id: "c11", slug: "food-containers", name: "Cups & food containers", parentSlug: "packaging" },
  { id: "c12", slug: "paper-bags", name: "Paper bags", parentSlug: "packaging" },
  { id: "c13", slug: "mailers", name: "Mailer packaging", parentSlug: "packaging" },
  { id: "c14", slug: "other", name: "Other packaging", parentSlug: "packaging" },
  { id: "c19", slug: "office-school", name: "Office & school supplies", parentSlug: null },
  { id: "c36", slug: "paper-products", name: "Paper products", parentSlug: "office-school" },
  { id: "c37", slug: "office-furniture", name: "Office furniture", parentSlug: "office-school" },
  { id: "c20", slug: "furniture-home", name: "Furniture & home", parentSlug: null },
  { id: "c38", slug: "home-furniture", name: "Home furniture", parentSlug: "furniture-home" },
  { id: "c39", slug: "kitchenware", name: "Kitchenware", parentSlug: "furniture-home" },
  { id: "c21", slug: "clothing-textiles", name: "Clothing & textiles", parentSlug: null },
  { id: "c1", slug: "custom-shirts", name: "Custom shirts", parentSlug: "clothing-textiles" },
  { id: "c40", slug: "uniforms", name: "Uniforms & workwear", parentSlug: "clothing-textiles" },
  { id: "c41", slug: "fabrics", name: "Fabrics", parentSlug: "clothing-textiles" },
  { id: "c22", slug: "beauty-personal-care", name: "Beauty & personal care", parentSlug: null },
  { id: "c42", slug: "cosmetics", name: "Cosmetics", parentSlug: "beauty-personal-care" },
  { id: "c43", slug: "toiletries", name: "Toiletries & hotel amenities", parentSlug: "beauty-personal-care" },
  { id: "c23", slug: "logistics-transport", name: "Logistics & transport", parentSlug: null },
  { id: "c44", slug: "trucking", name: "Trucking & freight", parentSlug: "logistics-transport" },
  { id: "c45", slug: "warehousing", name: "Warehousing", parentSlug: "logistics-transport" },
  { id: "c24", slug: "business-services", name: "Business & professional services", parentSlug: null },
  { id: "c46", slug: "design-branding", name: "Design & branding", parentSlug: "business-services" },
  { id: "c47", slug: "accounting-legal", name: "Accounting & legal", parentSlug: "business-services" },
  { id: "c25", slug: "raw-materials", name: "Raw materials", parentSlug: null },
  { id: "c48", slug: "plastics-resin", name: "Plastics & resin", parentSlug: "raw-materials" },
  { id: "c49", slug: "paper-pulp", name: "Paper & pulp", parentSlug: "raw-materials" },
];


export const LAUNCH_CATEGORIES = CATEGORIES.filter((c) => c.parentSlug === null);

export const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
