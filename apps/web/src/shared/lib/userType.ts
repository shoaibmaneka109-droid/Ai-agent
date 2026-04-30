import type { UserType } from "@securepay/shared";

export function userTypeLabel(t: UserType): string {
  return t === "solo" ? "Solo (Individual)" : "Agency (Company)";
}
