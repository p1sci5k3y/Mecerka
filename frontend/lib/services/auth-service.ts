import { api } from '@/lib/api';

export interface LoginPayload {
  email: string;
  password?: string;
  token?: string; // used for mfa
}

export interface RegisterPayload {
  email: string;
  password?: string;
  name?: string;
  role?: string;
}

export const authService = {
  async register(payload: RegisterPayload) {
    return api.post('/auth/register', payload);
  },

  async login(payload: LoginPayload) {
    return api.post('/auth/login', payload);
  },

  async getProfile() {
    return api.get('/auth/me');
  },

  // MFA methods preserved
  async setupMfa() {
    return api.post('/auth/mfa/setup', {}); // Body required?
  },

  async verifyMfa(token: string) {
    return api.post('/auth/mfa/verify', { token });
  },

  async verifyEmail(token: string) {
    return api.get(`/auth/verify?token=${token}`);
  }
};
