import type { Role, User } from "@/lib/types"

export function getPrimaryRouteForRoles(roles?: Role[] | null) {
  if (roles?.includes("ADMIN")) return "/admin"
  if (roles?.includes("PROVIDER")) return "/provider/sales"
  if (roles?.includes("RUNNER")) return "/runner"
  return "/dashboard"
}

export function getPrimaryRouteForUser(user?: Pick<User, "roles"> | null) {
  return getPrimaryRouteForRoles(user?.roles)
}
