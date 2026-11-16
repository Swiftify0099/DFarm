import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { PlatformPermission } from '@/types'
import { ClayCard } from '@/components/ui/ClayCard'
import { ShieldX } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredPermission?: PlatformPermission
  requiredPermissions?: PlatformPermission[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredPermissions,
}) => {
  const { isAuthenticated, isLoading, hasPermission, hasAnyPermission } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-[#FFF5EE]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FF6A00] animate-spin flex items-center justify-center text-white font-black">
            D
          </div>
          <p className="text-xs font-semibold text-[#817A75]">
            Verifying Platform Authorization...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <ClayCard variant="peach" className="text-center p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldX className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#211B18]">Permission Denied</h2>
          <p className="text-xs text-[#817A75]">
            Your current platform operator account does not hold the required{' '}
            <code className="bg-white px-1.5 py-0.5 rounded text-[#211B18] font-mono">
              {requiredPermission}
            </code>{' '}
            authorization. Every privileged request is validated by the backend.
          </p>
        </ClayCard>
      </div>
    )
  }

  if (requiredPermissions && !hasAnyPermission(requiredPermissions)) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <ClayCard variant="peach" className="text-center p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldX className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#211B18]">Permission Denied</h2>
          <p className="text-xs text-[#817A75]">
            Access to this feature requires one of the following permissions:{' '}
            {requiredPermissions.join(', ')}.
          </p>
        </ClayCard>
      </div>
    )
  }

  return <>{children}</>
}
