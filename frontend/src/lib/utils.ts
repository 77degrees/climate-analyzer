import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTemp(temp: number | null | undefined): string {
  if (temp == null) return "--";
  return `${Math.round(temp)}°F`;
}

export function formatHumidity(h: number | null | undefined): string {
  if (h == null) return "--";
  return `${Math.round(h)}%`;
}
