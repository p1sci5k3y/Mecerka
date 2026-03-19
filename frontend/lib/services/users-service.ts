import { api } from "@/lib/api"
import type { RequestRolePayload, RequestRoleResponse } from "@/lib/types"

export const usersService = {
  requestRole(payload: RequestRolePayload) {
    return api.post<RequestRoleResponse>("/users/request-role", payload)
  },
}
