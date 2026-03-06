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
  async generateMfaEmailOtp() {
    return api.post('/auth/mfa/generate-email-otp');
  },

  async setupMfa(otpCode: string) {
    return api.post('/auth/mfa/setup', { otpCode });
  },

  async verifyMfa(token: string) {
    return api.post('/auth/mfa/verify', { token });
  },

  async verifyEmail(token: string) {
    return api.get(`/auth/verify?token=${token}`);
  },

  async verifyMagicLink(token: string) {
    return api.post('/auth/magic-link/verify', { token });
  }
};
