import { Plus, Minus, MoveRight, Equal, AlertTriangle } from "lucide-react";

// --- Variant identity: color + shape for 1:Many comparison ---
export interface VariantIdentity {
  color: string;
  label: string;
  shape: "circle" | "square" | "diamond" | "triangle" | "pentagon";
}

export const VARIANT_IDENTITIES: VariantIdentity[] = [
  { color: "#6B3FA0", label: "Variant 1", shape: "circle" },
  { color: "#FF5F00", label: "Variant 2", shape: "square" },
  { color: "#922D9E", label: "Variant 3", shape: "diamond" },
  { color: "#FFAA19", label: "Variant 4", shape: "triangle" },
  { color: "#541C59", label: "Variant 5", shape: "pentagon" },
];

/** Render a small inline SVG shape for variant identification */
export function variantShapeSVG(index: number, size = 12): string {
  const identity = VARIANT_IDENTITIES[index] ?? VARIANT_IDENTITIES[0];
  const { color, shape } = identity;
  const s = size;
  const h = s / 2;
  switch (shape) {
    case "circle":
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${h}" cy="${h}" r="${h - 1}" fill="${color}"/></svg>`;
    case "square":
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="1" fill="${color}"/></svg>`;
    case "diamond":
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><polygon points="${h},1 ${s - 1},${h} ${h},${s - 1} 1,${h}" fill="${color}"/></svg>`;
    case "triangle":
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><polygon points="${h},1 ${s - 1},${s - 1} 1,${s - 1}" fill="${color}"/></svg>`;
    case "pentagon": {
      const pts = [0, 1, 2, 3, 4]
        .map((i) => {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          return `${h + (h - 1) * Math.cos(angle)},${h + (h - 1) * Math.sin(angle)}`;
        })
        .join(" ");
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><polygon points="${pts}" fill="${color}"/></svg>`;
    }
    default:
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${h}" cy="${h}" r="${h - 1}" fill="${color}"/></svg>`;
  }
}

export const PROCESSING_STEPS = [
  "Uploading documents",
  "Extracting text & structure",
  "Analyzing differences",
  "Identifying critical changes",
  "Generating AI insights",
  "Creating visual report",
];

export const BADGE: Record<string, { bg: string; text: string; border: string }> = {
  changed:   { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  deleted:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  added:     { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  moved:     { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  unchanged: { bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200" },
};

export const SUMMARY_CARD: Record<string, { icon: typeof Plus; label: string; bg: string; text: string; border: string }> = {
  changed:   { icon: AlertTriangle, label: "Changed",   bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  deleted:   { icon: Minus,         label: "Deleted",   bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  added:     { icon: Plus,          label: "Added",     bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  moved:     { icon: MoveRight,     label: "Moved",     bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  unchanged: { icon: Equal,         label: "Unchanged", bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200" },
};

export const CLAUSE_TYPE_STYLE: Record<string, { label: string; fg: string; bg: string }> = {
  "definition":          { label: "Definition",          fg: "#6d28d9", bg: "#ede9fe" },
  "obligation":          { label: "Obligation",          fg: "#0369a1", bg: "#e0f2fe" },
  "condition-precedent": { label: "Condition Precedent", fg: "#a16207", bg: "#fef9c3" },
  "termination":         { label: "Termination",         fg: "#b91c1c", bg: "#fee2e2" },
  "representation":      { label: "Representation",      fg: "#047857", bg: "#d1fae5" },
  "fee/payment":         { label: "Fee / Payment",       fg: "#0e7490", bg: "#cffafe" },
  "indemnification":     { label: "Indemnification",     fg: "#9333ea", bg: "#f3e8ff" },
  "liability":           { label: "Liability",           fg: "#c2410c", bg: "#fff7ed" },
  "confidentiality":     { label: "Confidentiality",     fg: "#4f46e5", bg: "#eef2ff" },
  "ip":                  { label: "Intellectual Property",fg: "#0d9488", bg: "#ccfbf1" },
  "governing-law":       { label: "Governing Law",       fg: "#475569", bg: "#f1f5f9" },
  "other":               { label: "Other",               fg: "#6b7280", bg: "#f3f4f6" },
};
