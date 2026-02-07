import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi } from '@/lib/api/auth';
import type { LoginPayload, RegisterPayload } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth.store';

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (response) => {
      const { user, tokens } = response.data;
      login(tokens.accessToken, tokens.refreshToken, user);
      navigate('/dashboard');
      toast.success('Welcome back!');
    },
    onError: () => {
      toast.error('Invalid email or password');
    },
  });
}

export function useRegister() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (response) => {
      const { user, tokens } = response.data;
      login(tokens.accessToken, tokens.refreshToken, user);
      navigate('/dashboard');
      toast.success('Account created successfully!');
    },
    onError: () => {
      toast.error('Registration failed. Please try again.');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    onSuccess: () => {
      toast.success('Password reset link sent to your email');
    },
    onError: () => {
      toast.error('Failed to send reset link');
    },
  });
}

export function useResetPassword() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
    onSuccess: () => {
      toast.success('Password reset successfully');
      navigate('/login');
    },
    onError: () => {
      toast.error('Failed to reset password');
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      navigate('/login');
    },
  });
}
