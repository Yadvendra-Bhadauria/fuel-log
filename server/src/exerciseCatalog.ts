import { z } from "zod";
import type { ExerciseCatalogEntry } from "@fuel-log/shared";

const wgerResponseSchema = z.object({
  results: z.array(z.object({
    id: z.number().int().positive(),
    category: z.object({ name: z.string() }),
    equipment: z.array(z.object({ name: z.string() })),
    license: z.object({ short_name: z.string(), url: z.string().nullable() }),
    license_author: z.string(),
    translations: z.array(z.object({ language: z.number().int(), name: z.string() })),
  })),
});

export function parseWgerExerciseCatalog(payload: unknown): ExerciseCatalogEntry[] {
  const response = wgerResponseSchema.parse(payload);
  const entries = response.results.flatMap((exercise) => {
    const translation = exercise.translations.find((item) => item.language === 2);
    const name = translation?.name.trim();
    if (!name || name.length > 120) return [];
    return [{
      id: exercise.id,
      name,
      category: exercise.category.name,
      equipment: exercise.equipment.map((item) => item.name).sort(),
      license: exercise.license.short_name,
      licenseUrl: exercise.license.url,
      author: exercise.license_author,
    }];
  });
  const unique = new Map<string, ExerciseCatalogEntry>();
  for (const entry of entries) {
    const key = entry.name.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

let cachedCatalog: { expiresAt: number; entries: ExerciseCatalogEntry[] } | null = null;
let catalogRequest: Promise<ExerciseCatalogEntry[]> | null = null;

export async function getExerciseCatalog(): Promise<ExerciseCatalogEntry[]> {
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.entries;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    const response = await fetch("https://wger.de/api/v2/exerciseinfo/?language=2&limit=1000", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Exercise catalogue returned HTTP ${response.status}.`);
    const entries = parseWgerExerciseCatalog(await response.json());
    cachedCatalog = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, entries };
    return entries;
  })();

  try {
    return await catalogRequest;
  } finally {
    catalogRequest = null;
  }
}
