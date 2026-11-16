import { apiRequest, jsonRequest } from './apiClient'

export type ManagedRole = 'manager' | 'user'

export interface ManagedUser {
  username: string
  displayName: string
  role: ManagedRole
}

export const userApi = {
  async list(): Promise<ManagedUser[]> {
    return apiRequest<ManagedUser[]>('/api/users')
  },

  async create(
    username: string,
    password: string,
    displayName: string,
    role: ManagedRole = 'user',
  ): Promise<ManagedUser> {
    return apiRequest<ManagedUser>(
      '/api/users',
      jsonRequest('POST', { username, password, displayName, role }),
    )
  },

  async remove(username: string): Promise<ManagedUser[]> {
    return apiRequest<ManagedUser[]>(`/api/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    })
  },
}
