import { ApiError, apiRequest, jsonRequest } from './apiClient'

export type AuthRole = 'admin' | 'manager' | 'user'

export interface AuthSession {
  authenticated: boolean
  role?: AuthRole
  username?: string
}

export const authApi = {
  async login(username: string, password: string): Promise<boolean> {
    try {
      await apiRequest('/api/auth/login', jsonRequest('POST', { username, password }))
      return true
    } catch (error) {
      if (error instanceof Error && error.message === '账号或密码不正确，请重试') return false
      throw error
    }
  },

  async getSession(): Promise<AuthSession> {
    return apiRequest<AuthSession>('/api/auth/session')
  },

  async isAuthenticated(): Promise<boolean> {
    try {
      return (await this.getSession()).authenticated
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false
      throw error
    }
  },

  async logout(): Promise<void> {
    await apiRequest('/api/auth/logout', { method: 'POST' })
  },
}
