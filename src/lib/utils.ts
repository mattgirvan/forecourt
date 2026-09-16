import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function gbp(n: number) {
  const sign = n < 0 ? "−" : "";
  return `${sign}£${Math.abs(n).toLocaleString("en-GB")}`;
}
