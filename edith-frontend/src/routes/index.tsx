import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { TasksPage } from '@/pages/tasks/TasksPage';
import { InboxPage } from '@/pages/inbox/InboxPage';
import { CalendarPage } from '@/pages/calendar/CalendarPage';
import { CRMPage } from '@/pages/crm/CRMPage';
import { ExpensesPage } from '@/pages/expenses/ExpensesPage';
import { TravelPage } from '@/pages/travel/TravelPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { ActivityLogPage } from '@/pages/activity/ActivityLogPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/crm" element={<CRMPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/travel" element={<TravelPage />} />
          <Route path="/activity" element={<ActivityLogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
