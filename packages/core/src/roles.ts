export const roles = ["VISITOR", "STUDENT", "ADMIN", "SYSTEM"] as const;
export type Role = (typeof roles)[number];

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

/**
 * Roles are capabilities rather than a numeric hierarchy. Keeping this helper
 * explicit prevents a future role from accidentally inheriting administrator
 * access simply because of ordering.
 */
export function roleCanAccessAdmin(role: Role): boolean {
  return role === "ADMIN" || role === "SYSTEM";
}
