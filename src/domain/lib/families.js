// src/domain/lib/families.js
import { norm } from "./parsing";

export const isLVL         = (f = "") => norm(f).includes("lvl");
export const isVersaColumn = (f = "") => norm(f).includes("versa");

export const isSPF_PT_SYP = (f = "") => {
  const x = norm(f);
  return x.includes("spf#2") || x.includes("spf2") ||
         x.includes("syp#2") || x.includes("syp2") ||
         x.includes("syp#1") || x.includes("syp1") ||
         x === "pt" || x.includes("treated");
};

export const isLumberFamily = (f = "") =>
  isSPF_PT_SYP(f) ||
  norm(f).includes("frt") || norm(f).includes("fire rated lumber") ||
  norm(f).includes("douglas fir") ||
  norm(f).includes("pt") ||  
  norm(f).includes("hem fir") || norm(f).includes("hemfir");

export const isInfillFamily = (f = "") => {
  const x = norm(f);
  return (
    x.includes("spf#2") || x.includes("spf2") ||
    x === "pt" || x.includes("treated") ||
    x.includes("hem fir") || x.includes("hemfir") ||
    x.includes("syp#2") || x.includes("syp2") ||
    x.includes("syp#1") || x.includes("syp1") ||
    x.includes("frt") || x.includes("fire rated lumber") ||
    x.includes("douglas fir")

  );
};

/**
 * Bought by the linear foot rather than by the board: engineered lumber
 * (LVL, LSL, PSL, rim board) and anything the price list sells per LF.
 * @param item the price-list item ({ unit, familyDisplay }) or a selection
 */
export const isSoldByLF = (item) => {
  if (!item) return false;
  const unit = String(item.unit ?? item.raw?.unit ?? item.item?.unit ?? '').trim().toLowerCase();
  if (/^(l\.?f\.?|lin(eal|ear)?\b.*|ft|feet|foot)$/.test(unit)) return true;
  const fam = norm(item.familyLabel ?? item.familyDisplay ?? item.raw?.familyDisplay ?? item.item?.familyDisplay ?? '');
  return /\b(lvl|lsl|psl)\b|rim ?board|microllam|timberstrand|parallam/.test(fam);
};
