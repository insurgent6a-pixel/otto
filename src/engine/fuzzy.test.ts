import { describe, expect, it } from "vitest";
import { KNOWN_NAMES, findBestMatch, findDuplicate, fixNames, normalize, similarity } from "./fuzzy";

describe("normalize", () => {
  it("lowercases, strips punctuation and accents, collapses spaces", () => {
    expect(normalize("  Hello,   World!! ")).toBe("hello world");
    expect(normalize("Café-time")).toBe("cafe time");
  });
});

describe("similarity", () => {
  it("is 1 for identical normalized strings and 0 for empty", () => {
    expect(similarity("Navaho payments!", "navaho  payments")).toBe(1);
    expect(similarity("", "x")).toBe(0);
  });

  it("handles typos and word order", () => {
    expect(similarity("navaho payment", "Navaho payments")).toBeGreaterThan(0.9);
    expect(similarity("payments navaho", "navaho payments")).toBe(1);
    expect(similarity("buy compost", "call Demian")).toBeLessThan(0.3);
  });

  it("expands dp to down payment", () => {
    expect(similarity("sultan dp", "Sultan down payment")).toBe(1);
  });

  it("single characters do not crash", () => {
    expect(similarity("a", "b")).toBe(0);
  });
});

describe("findBestMatch", () => {
  const tasks = [
    { id: "a", title: "Follow up Pak Arief on the Sultan down payment" },
    { id: "b", title: "Navaho payments" },
    { id: "c", title: "Sultan contract" },
  ];

  it("contained query scores high", () => {
    const m = findBestMatch("sultan dp", tasks);
    expect(m?.id).toBe("a");
    expect(m!.similarity).toBeGreaterThanOrEqual(0.9);
  });

  it("prefers the closer title on a tie", () => {
    expect(findBestMatch("sultan", tasks)?.id).toBe("c");
  });

  it("null for no candidates or no overlap", () => {
    expect(findBestMatch("x", [])).toBeNull();
    expect(findBestMatch("", tasks)).toBeNull();
  });
});

describe("findDuplicate", () => {
  const open = [
    { id: "b", title: "Navaho payments" },
    { id: "d", title: "Navaho payments for March" },
  ];

  it("returns the best match above the threshold", () => {
    expect(findDuplicate("Navaho payment", open)?.id).toBe("b");
  });

  it("returns null under the threshold", () => {
    expect(findDuplicate("payment", open)).toBeNull();
    expect(findDuplicate("Navaho payment", open, 0.99)).toBeNull();
  });
});

describe("fixNames", () => {
  it.each([
    ["pay navajo today", "pay Navaho today"],
    ["call demi an", "call Demian"],
    ["ask pak arif", "ask Pak Arief"],
    ["Pak arief said", "Pak Arief said"],
    ["sundary invoice", "Sundari invoice"],
    ["visit rumah ati", "visit Rumahati"],
    ["email ivg", "email IVG"],
    ["email i v g now", "email IVG now"],
    ["teba reel", "Teba reel"],
    ["sultan dp", "Sultan dp"],
    ["damian, then navajo.", "Demian, then Navaho."],
  ])("%s -> %s", (input, want) => expect(fixNames(input)).toBe(want));

  it("leaves ordinary words alone", () => {
    const text = "send the demand today and study the median sultana nevada sunday rumah data";
    expect(fixNames(text)).toBe(text);
  });

  it("does not join across punctuation", () => {
    expect(fixNames("demi, an")).toBe("demi, an");
  });

  it("accepts a custom name list and handles empty text", () => {
    expect(fixNames("call jonh", ["John"])).toBe("call jonh");
    expect(fixNames("call jonathon", ["Jonathan"])).toBe("call Jonathan");
    expect(fixNames("")).toBe("");
    expect(fixNames("!!")).toBe("!!");
  });

  it("exports the known names", () => {
    expect(KNOWN_NAMES).toContain("Pak Arief");
  });
});
