"use client";

export interface SkillOption {
  label: string;
  id: string | null;
  accent: string;
}

export const COMPARE_SKILLS: SkillOption[] = [
  { label: "General", id: null, accent: "#64748b" },
  { label: "Legal Counsel", id: "legal", accent: "#401842" },
  { label: "Business Strategist", id: "executive", accent: "#6B3FA0" },
  { label: "Technical Author", id: "technical", accent: "#FF5F00" },
  { label: "HR Professional", id: "hr", accent: "#401842" },
  { label: "Research Analyst", id: "research", accent: "#6B3FA0" },
];

export function SkillSelector({
  activeSkill,
  onSelect,
}: {
  activeSkill: string | null;
  onSelect: (skillId: string | null) => void;
}) {
  const selected = COMPARE_SKILLS.find((s) => s.id === activeSkill) ?? COMPARE_SKILLS[0];

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground">Review as:</span>
      <select
        value={activeSkill ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="h-9 px-3 pr-8 rounded-lg border border-slate-200 text-sm font-medium text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer appearance-none"
        aria-label="Select review skill"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        {COMPARE_SKILLS.map((skill) => (
          <option key={skill.label} value={skill.id ?? ""}>
            {skill.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Get the display label for a skill ID */
export function getSkillLabel(skillId: string | null): string | null {
  if (!skillId) return null;
  return COMPARE_SKILLS.find((s) => s.id === skillId)?.label ?? skillId;
}
