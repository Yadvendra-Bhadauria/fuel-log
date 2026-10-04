import { describe, expect, it } from "vitest";
import { parseWgerExerciseCatalog } from "../src/exerciseCatalog.js";

describe("wger exercise catalogue", () => {
  it("maps English exercise names and licence attribution into picker entries", () => {
    const entries = parseWgerExerciseCatalog({
      count: 2,
      results: [
        {
          id: 14,
          category: { id: 2, name: "Chest" },
          equipment: [{ id: 1, name: "Barbell" }],
          license: { short_name: "CC BY-SA 4", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
          license_author: "Contributor",
          translations: [{ language: 2, name: "Bench press" }],
        },
        {
          id: 15,
          category: { id: 9, name: "Legs" },
          equipment: [],
          license: { short_name: "CC BY-SA 3", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
          license_author: "Another contributor",
          translations: [{ language: 1, name: "Nicht englisch" }, { language: 2, name: "Squat" }],
        },
      ],
    });

    expect(entries).toEqual([
      {
        id: 14,
        name: "Bench press",
        category: "Chest",
        equipment: ["Barbell"],
        license: "CC BY-SA 4",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        author: "Contributor",
      },
      {
        id: 15,
        name: "Squat",
        category: "Legs",
        equipment: [],
        license: "CC BY-SA 3",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
        author: "Another contributor",
      },
    ]);
  });

  it("skips untranslated or overlong names and de-duplicates by exercise name", () => {
    const entries = parseWgerExerciseCatalog({
      results: [
        {
          id: 1, category: { name: "Chest" }, equipment: [],
          license: { short_name: "CC BY-SA", url: null }, license_author: "",
          translations: [{ language: 2, name: "Push-up" }],
        },
        {
          id: 2, category: { name: "Chest" }, equipment: [],
          license: { short_name: "CC BY-SA", url: null }, license_author: "",
          translations: [{ language: 2, name: " push-up " }],
        },
        {
          id: 3, category: { name: "Chest" }, equipment: [],
          license: { short_name: "CC BY-SA", url: null }, license_author: "",
          translations: [{ language: 1, name: "Push-up" }],
        },
        {
          id: 4, category: { name: "Chest" }, equipment: [],
          license: { short_name: "CC BY-SA", url: null }, license_author: "",
          translations: [{ language: 2, name: "x".repeat(121) }],
        },
      ],
    });

    expect(entries.map((entry) => entry.name)).toEqual(["Push-up"]);
    expect(entries[0]?.id).toBe(1);
  });
});
