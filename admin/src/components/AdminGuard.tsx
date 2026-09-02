import { DashboardLayoutSkeleton } from '@/components/DashboardLayoutSkeleton';
import { useAuth } from '@/_core/hooks/useAuth';
import { useEffect } from 'react';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const staffRoles = ['admin', 'super_admin', 'support', 'viewer'];
    if (!user) {
      window.location.href = '/login';
    } else if (!staffRoles.includes(user.role)) {
      window.location.href = '/projects';
    }
  }, [loading, user]);

  const staffRoles = ['admin', 'super_admin', 'support', 'viewer'];
  if (loading || !user || !staffRoles.includes(user.role)) {
    return <DashboardLayoutSkeleton />;
  }

  return <>{children}</>;
}
