import { describe, expect, it } from "vitest";
import { formatIdr, formatIdrShort, parseIdr } from "./money";

describe("parseIdr", () => {
  it.each([
    ["50jt", 50_000_000],
    ["50 juta", 50_000_000],
    ["Rp 50.000.000", 50_000_000],
    ["Rp50.000.000", 50_000_000],
    ["Rp. 50.000", 50_000],
    ["rp 5jt", 5_000_000],
    ["750rb", 750_000],
    ["750 ribu", 750_000],
    ["1,5jt", 1_500_000],
    ["1.5jt", 1_500_000],
    ["2,25jt", 2_250_000],
    ["1.500rb", 1_500_000],
    ["5k", 5_000],
    ["50000", 50_000],
    ["50.000", 50_000],
    ["50,000", 50_000],
    ["Rp 50.000,00", 50_000],
    ["0", 0],
  ])("%s -> %d", (input, want) => expect(parseIdr(input)).toBe(want));

  it.each(["", "  ", "abc", "2m", "2M", "Rp", "50.00.0", "1.2345jt", "5 jt rb", "-5jt", "50.5"])("%j -> null", (input) =>
    expect(parseIdr(input)).toBeNull(),
  );
});

describe("formatIdr", () => {
  it("uses Indonesian dots and no decimals", () => {
    expect(formatIdr(18_500_000)).toBe("Rp 18.500.000");
    expect(formatIdr(750)).toBe("Rp 750");
    expect(formatIdr(1234.6)).toBe("Rp 1.235");
    expect(formatIdr(-5000)).toBe("-Rp 5.000");
  });
});

describe("formatIdrShort", () => {
  it.each([
    [18_500_000, "Rp 18,5jt"],
    [750_000, "Rp 750rb"],
    [5_000_000, "Rp 5jt"],
    [999_999, "Rp 1jt"],
    [1_500, "Rp 1,5rb"],
    [2_500_000_000, "Rp 2,5M"],
    [500, "Rp 500"],
    [-750_000, "-Rp 750rb"],
  ])("%d -> %s", (n, want) => expect(formatIdrShort(n)).toBe(want));
});
