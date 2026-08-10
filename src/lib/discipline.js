/* ═══════════════════════════════════════════════════════════════════════════
   DISCIPLINE — the single source of the tech[] → discipline keyword map.
   Consumed by the Projects archive (dossier metadata + filter row) and later
   by the Team constellation (project↔discipline edges). Spec: §Projects.

   DISCIPLINE is DERIVED, never fetched and never invented: it reads only the
   project's real tech[] strings. Matching is case-insensitive substring, and
   it walks the tech list IN ARRAY ORDER, trying every discipline against each
   entry before moving to the next — the leading entries of a stack name its
   primary tooling. That order is what makes DynaSync ("Python, Scikit-learn,
   MNE-Python") read AI × BIOLOGY (Scikit at index 1) rather than BIO
   INSTRUMENTATION (MNE at index 2), matching the spec's dossier example.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DISCIPLINES = [
  {
    id: "bio-instrumentation",
    label: "BIO INSTRUMENTATION",
    keywords: ["mne", "eeg", "esp32", "arduino", "iot"],
    bio: ["eeg", "ecg", "biosensor", "biosensors", "arduino", "esp32", "instrumentation"],
  },
  {
    id: "ai-biology",
    label: "AI × BIOLOGY",
    keywords: ["tensorflow", "scikit", "ml", "dl", "numpy"],
    bio: ["ai", "ml", "deep learning", "machine learning", "data science", "neural"],
  },
  {
    id: "synbio",
    label: "SYNTHETIC BIOLOGY",
    keywords: ["computational biology", "genetic"],
    bio: ["synthetic biology", "igem", "gogec", "genetic"],
  },
  {
    id: "simulation",
    label: "SIMULATION",
    keywords: ["unity", "c#"],
    bio: ["simulation", "simulating", "simulator"],
  },
];

const DEFAULT_DISCIPLINE = { id: "bioengineering", label: "BIOENGINEERING" };

/**
 * disciplineFor(tech: string[]) → { id, label }
 *
 * Tolerates anything: a missing array, non-string entries, an empty list —
 * everything unmatched files under the club's own name, BIOENGINEERING.
 */
export function disciplineFor(tech) {
  if (!Array.isArray(tech)) return DEFAULT_DISCIPLINE;

  for (const entry of tech) {
    if (typeof entry !== "string") continue;
    const t = entry.toLowerCase();
    for (const { id, label, keywords } of DISCIPLINES) {
      if (keywords.some((k) => t.includes(k))) return { id, label };
    }
  }

  return DEFAULT_DISCIPLINE;
}

/* Whole-word containment for prose matching — "AI" must not fire inside
   "sustainability". Survives non-alphanumeric keywords ("c#") and hyphenated
   strings ("MNE-Python"). Used for member bios, NOT for tech[] (tech entries
   are controlled vocabulary; bios are free prose). */
const hasWord = (text, word) => {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(text);
};

/**
 * disciplineForMember(member) → discipline id | null
 *
 * Attaches a member to a discipline via their bio/role prose. Null when
 * nothing matches — the caller decides the fallback (the constellation links
 * unmatched members straight to the KBG centre).
 */
export function disciplineForMember(member) {
  const text = `${member?.bio || ""} ${member?.role || ""}`;
  for (const d of DISCIPLINES) {
    if (d.bio.some((kw) => hasWord(text, kw))) return d.id;
  }
  return null;
}
