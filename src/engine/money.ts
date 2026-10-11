// Rupiah amounts as people type them: '50jt', 'Rp 50.000.000', '750rb', '1,5jt', '5k'.

const UNITS: Record<string, number> = { jt: 1e6, juta: 1e6, rb: 1e3, ribu: 1e3, k: 1e3 };

export function parseIdr(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/^rp\.?\s*/, "");
  const m = /^(\d[\d.,]*)\s*(jt|juta|rb|ribu|k)?$/.exec(s);
  if (!m) return null;
  const [, num, unit] = m;
  if (unit) {
    // With a unit a single separator followed by 1-2 digits is a decimal: '1,5jt', '1.5jt'.
    if (/^\d+([.,]\d{1,2})?$/.test(num)) return Math.round(Number(num.replace(",", ".")) * UNITS[unit]);
    if (/^\d{1,3}([.,]\d{3})+$/.test(num)) return Number(num.replace(/[.,]/g, "")) * UNITS[unit];
    return null;
  }
  const whole = num.replace(/,\d{1,2}$/, ""); // drop Indonesian cents: '50.000,00'
  if (/^\d+$/.test(whole)) return Number(whole);
  if (/^\d{1,3}(\.\d{3})+$/.test(whole) || /^\d{1,3}(,\d{3})+$/.test(whole)) return Number(whole.replace(/[.,]/g, ""));
  return null;
}

const dots = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** 'Rp 18.500.000' */
export function formatIdr(n: number): string {
  return `${n < 0 ? "-" : ""}Rp ${dots(n)}`;
}

/** 'Rp 18,5jt', 'Rp 750rb', 'Rp 1,2M' (M = miliar). */
export function formatIdrShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const short = (v: number, suffix: string) => `${sign}Rp ${String(Math.round(v * 10) / 10).replace(".", ",")}${suffix}`;
  if (a >= 999_950_000) return short(a / 1e9, "M");
  if (a >= 999_950) return short(a / 1e6, "jt");
  if (a >= 1e3) return short(a / 1e3, "rb");
  return formatIdr(n);
}
