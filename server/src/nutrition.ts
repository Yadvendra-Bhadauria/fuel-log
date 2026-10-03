import type { MealAnalysisItem, ProductMatch } from "@fuel-log/shared";

type OpenFoodFactsProduct = {
  product_name?: string;
  brands?: string;
  code?: string;
  nutriments?: Record<string, number | string | undefined>;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function openFoodFactsMatch(products: OpenFoodFactsProduct[], query: string): ProductMatch | null {
  const normalizedQuery = normalize(query);
  const product = products.find((candidate) => {
    const name = normalize(candidate.product_name ?? "");
    return name && (name === normalizedQuery || name.includes(normalizedQuery) || normalizedQuery.includes(name));
  });
  if (!product?.nutriments || !product.product_name) return null;

  const nutrition = product.nutriments;
  const kcal = Number(nutrition["energy-kcal_100g"] ?? nutrition["energy-kcal"]);
  const protein = Number(nutrition.proteins_100g);
  const carbs = Number(nutrition.carbohydrates_100g);
  const fat = Number(nutrition.fat_100g);
  if (![kcal, protein, carbs, fat].every(Number.isFinite) || kcal <= 0) return null;

  return {
    name: product.product_name,
    brand: product.brands,
    barcode: product.code,
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbsPer100g: carbs,
    fatPer100g: fat,
    source: "open_food_facts",
  };
}

async function searchOpenFoodFacts(query: string): Promise<ProductMatch | null> {
  if (/^\d{8,14}$/.test(query)) {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(query)}.json`, {
      headers: { "User-Agent": "FuelLog/1.0 (nutrition lookup)" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { status?: number; product?: OpenFoodFactsProduct };
    const product = data.status === 1 ? data.product : undefined;
    if (!product?.product_name) return null;
    const match = openFoodFactsMatch([product], product.product_name);
    return match ? { ...match, barcode: query } : null;
  }
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "8");
  const response = await fetch(url, { headers: { "User-Agent": "FuelLog/1.0 (nutrition lookup)" } });
  if (!response.ok) return null;
  const data = (await response.json()) as { products?: OpenFoodFactsProduct[] };
  return openFoodFactsMatch(data.products ?? [], query);
}

async function searchUsda(query: string): Promise<ProductMatch | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) return null;
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as {
    foods?: Array<{ description?: string; foodNutrients?: Array<{ nutrientName?: string; value?: number }> }>;
  };
  const normalizedQuery = normalize(query);
  const food = (data.foods ?? []).find((candidate) => {
    const name = normalize(candidate.description ?? "");
    return name && (name === normalizedQuery || name.includes(normalizedQuery) || normalizedQuery.includes(name));
  });
  if (!food?.foodNutrients) return null;
  const value = (name: string) => food.foodNutrients?.find((item) => item.nutrientName?.toLowerCase() === name)?.value;
  const kcal = value("energy");
  const protein = value("protein");
  const carbs = value("carbohydrate, by difference");
  const fat = value("total lipid (fat)");
  if (![kcal, protein, carbs, fat].every((item) => typeof item === "number") || !kcal) return null;
  return {
    name: food.description ?? query,
    kcalPer100g: kcal,
    proteinPer100g: protein!,
    carbsPer100g: carbs!,
    fatPer100g: fat!,
    source: "usda",
  };
}

export async function findProduct(query: string): Promise<ProductMatch | null> {
  try {
    const offMatch = await searchOpenFoodFacts(query);
    if (offMatch) return offMatch;
  } catch {
    // A nutrition lookup should never prevent manual logging or photo review.
  }
  try {
    return await searchUsda(query);
  } catch {
    return null;
  }
}

export async function crossCheckItems(items: MealAnalysisItem[]): Promise<MealAnalysisItem[]> {
  return Promise.all(items.map(async (item) => {
    const match = await findProduct(item.name);
    if (!match || item.grams <= 0) return { ...item, source: "photo_ai" };
    const factor = item.grams / 100;
    return {
      ...item,
      kcal: Math.round(match.kcalPer100g * factor),
      protein_g: Math.round(match.proteinPer100g * factor * 10) / 10,
      carbs_g: Math.round(match.carbsPer100g * factor * 10) / 10,
      fat_g: Math.round(match.fatPer100g * factor * 10) / 10,
      source: match.source,
    };
  }));
}