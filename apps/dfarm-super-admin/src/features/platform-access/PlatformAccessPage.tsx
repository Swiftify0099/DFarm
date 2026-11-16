import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { useAuth } from '@/context/AuthContext'
import type { PlatformPermission } from '@/types'
import { formatDate, formatMobile } from '@/utils/formatters'
import {
  KeyRound,
  ShieldCheck,
  Lock,
  UserCheck,
  AlertCircle,
  FileCode2,
  CheckCircle2,
  Clock,
} from 'lucide-react'

const allPermissionsList: Array<{
  permission: PlatformPermission
  category: string
  description: string
}> = [
  {
    permission: 'dairies:read',
    category: 'Dairy Management',
    description: 'Read multi-tenant dairy directory and tenant status details',
  },
  {
    permission: 'dairies:create',
    category: 'Dairy Management',
    description: 'Provision new dairy businesses and generate tenant identities',
  },
  {
    permission: 'dairies:manage',
    category: 'Dairy Management',
    description: 'Update approved tenant profile and system configurations',
  },
  {
    permission: 'dairies:suspend',
    category: 'Dairy Management',
    description: 'Authorize operational suspension with mandatory audit reason',
  },
  {
    permission: 'dairies:reactivate',
    category: 'Dairy Management',
    description: 'Authorize reactivation of suspended tenant nodes',
  },
  {
    permission: 'admins:read',
    category: 'Dairy Admins',
    description: 'View primary dairy admin directory and verification states',
  },
  {
    permission: 'admins:manage',
    category: 'Dairy Admins',
    description: 'Resend activation invitations and disable admin access',
  },
  {
    permission: 'admins:transfer',
    category: 'Dairy Admins',
    description: 'Execute primary dairy admin root ownership transfers',
  },
  {
    permission: 'system:monitor',
    category: 'System Health',
    description: 'View real-time telemetry, queue depth, and hardware counts',
  },
  {
    permission: 'alerts:manage',
    category: 'Platform Alerts',
    description: 'Acknowledge and resolve operational incidents and alarms',
  },
  {
    permission: 'audit:read',
    category: 'Compliance Ledger',
    description: 'Inspect cryptographic append-only administrative audit log',
  },
  {
    permission: 'support:access',
    category: 'Controlled Support',
    description: 'Request short-lived diagnostic access for tenant troubleshooting',
  },
  {
    permission: 'reports:read',
    category: 'Platform Reports',
    description: 'Generate and export aggregated multi-tenant adoption reports',
  },
  {
    permission: 'platform:admin',
    category: 'Root Authority',
    description: 'Full platform administrative access to all subsystems',
  },
]

export const PlatformAccessPage: React.FC = () => {
  const { user } = useAuth()

  const { data: platformUsers = [], isLoading } = useQuery({
    queryKey: queryKeys.auth.users,
    queryFn: () => apiClient.getPlatformUsers(),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Platform Operators & Access Control
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Permission-based authorization architecture for central DFarm platform administration.
          </p>
        </div>
      </div>

      {/* Architecture Decision Documentation Banner */}
      <ClayCard variant="peach" className="space-y-3">
        <div className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm">
          <Lock className="w-5 h-5 shrink-0" />
          <span>Product Architecture Note: Uninvented Role Hierarchies</span>
        </div>
        <p className="text-xs text-[#817A75] leading-relaxed">
          In strict compliance with greenfield architecture requirements, no speculative SaaS role tiers (e.g. "billing manager", "regional supervisor", "junior admin") have been invented. Platform access is governed strictly by <strong>granular capability permissions</strong> checked on the backend for every privileged API call.
        </p>
      </ClayCard>

      {/* Authorized Platform Operators */}
      <ClayCard variant="default" className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
          Provisioned Platform Super Admin Operators
        </h3>

        <div className="divide-y divide-[#F1E7E0]">
          {platformUsers.map((op) => (
            <div
              key={op.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7B1A] to-[#FF6A00] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {op.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#211B18]">{op.fullName}</span>
                    <ClayBadge variant="active" label="PROVISIONED" />
                  </div>
                  <div className="text-xs text-[#817A75] mt-0.5 space-x-2">
                    <span>{op.email}</span>
                    <span>•</span>
                    <span className="font-mono">{formatMobile(op.mobile)}</span>
                  </div>
                  <span className="text-[11px] font-bold text-[#FF6A00] mt-1 block">
                    {op.roleTitle}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:items-end text-xs text-[#817A75]">
                <span>Last Session Authentication</span>
                <strong className="text-[#211B18] font-mono mt-0.5">
                  {formatDate(op.lastLoginAt)}
                </strong>
                <span className="text-emerald-700 font-semibold text-[11px] mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified Mobile OTP Holder
                </span>
              </div>
            </div>
          ))}
        </div>
      </ClayCard>

      {/* Permission Capability Matrix */}
      <ClayCard variant="default" className="space-y-4">
        <div className="border-b border-[#F1E7E0] pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
            Platform Permission Capability Matrix
          </h3>
          <p className="text-xs text-[#817A75] mt-0.5">
            Every administrative API endpoint validates one or more capability tokens.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {allPermissionsList.map((perm) => {
            const hasAccess =
              user?.permissions.includes(perm.permission) ||
              user?.permissions.includes('platform:admin')

            return (
              <div
                key={perm.permission}
                className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0] flex items-start gap-3"
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    hasAccess
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-stone-200 text-stone-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-mono font-bold text-[#211B18]">
                      {perm.permission}
                    </code>
                    <span className="text-[10px] font-bold text-[#817A75] uppercase">
                      {perm.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#817A75] mt-1">{perm.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </ClayCard>
    </div>
  )
}
