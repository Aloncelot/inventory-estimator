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
