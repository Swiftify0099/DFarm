import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import type { PlatformSettingsData } from '@/types'
import {
  Settings,
  Database,
  Smartphone,
  Mail,
  MessageSquare,
  Bell,
  CreditCard,
  ShieldCheck,
  Globe2,
  Lock,
  CheckCircle2,
  Server,
} from 'lucide-react'

export const PlatformSettingsPage: React.FC = () => {
  const { data: settings, isLoading } = useQuery<PlatformSettingsData>({
    queryKey: queryKeys.settings.platform,
    queryFn: () => apiClient.getPlatformSettings(),
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
              Platform Configuration & Gateway Status
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              System Settings
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Operational telemetry and infrastructure connectivity status across communication and database gateways.
          </p>
        </div>
      </div>

      {/* Security Guidance Banner */}
      <ClayCard variant="peach" className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm">
          <Lock className="w-5 h-5 shrink-0" />
          <span>Platform Security Policy: Zero Secret Exposure & Immutable Infrastructure</span>
        </div>
        <p className="text-xs text-[#817A75] leading-relaxed">
          Production secrets, database passwords, and cryptographic keys are masked and securely injected via container environment variables. In strict accordance with platform governance, arbitrary secret modification is prohibited via UI.
        </p>
      </ClayCard>

      {isLoading ? (
        <div className="p-12 text-center text-xs font-semibold text-[#817A75]">
          Loading platform configuration and gateway health...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General Platform Identity */}
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div className="flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-[#FF6A00]" />
                <h3 className="font-bold text-sm text-[#211B18]">Platform Identity & Regional Baseline</h3>
              </div>
              <ClayBadge variant="active" label="Production" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#817A75] block">Federation Name</span>
                <strong className="text-[#211B18]">{settings?.platformName || 'DFarm Federation'}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Core Version</span>
                <strong className="text-[#211B18] font-mono">{settings?.platformVersion || '2.4.0-prod'}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Cloud Deployment Region</span>
                <strong className="text-[#211B18]">{settings?.deploymentRegion || 'ap-south-1 (Mumbai)'}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Timezone & Currency</span>
                <strong className="text-[#211B18] font-mono">
                  {settings?.timezone || 'Asia/Kolkata (IST)'} • {settings?.currency || 'INR (₹)'}
                </strong>
              </div>
            </div>

            <div className="pt-2 border-t border-[#F1E7E0] text-xs">
              <span className="text-[#817A75] block mb-1">Supported Official Locales</span>
              <div className="flex flex-wrap gap-1.5">
                {(settings?.supportedLanguages || ['en-IN', 'mr-IN', 'hi-IN']).map((lang) => (
                  <span
                    key={lang}
                    className="px-2 py-0.5 rounded-lg bg-[#FAF6F3] border border-[#F1E7E0] font-mono text-[11px] font-bold text-[#211B18]"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          </ClayCard>

          {/* Database Architecture & Tenant Isolation */}
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-[#211B18]">PostgreSQL Tenant Database Cluster</h3>
              </div>
              <ClayBadge variant="operational" label="Healthy" />
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[#817A75] block">Control-Plane Node</span>
                <strong className="text-[#211B18] font-mono">
                  {settings?.databaseCluster?.controlPlane || 'dfarm_central (Managed Pool)'}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Multi-Tenant Architecture</span>
                <span className="text-emerald-700 font-bold block mt-0.5">
                  ✓ {settings?.databaseCluster?.isolationModel || 'Separate Physical PostgreSQL DB per Dairy'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <span className="text-[#817A75] block">TLS Transport Mode</span>
                  <strong className="text-[#211B18] font-mono">
                    {settings?.databaseCluster?.tlsMode?.toUpperCase() || 'PREFER'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#817A75] block">Max Pool Connections</span>
                  <strong className="text-[#211B18] font-mono">
                    {settings?.databaseCluster?.poolSize || 5} per Tenant Pool
                  </strong>
                </div>
              </div>
            </div>
          </ClayCard>

          {/* SMS & OTP Gateway */}
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#FF6A00]" />
                <h3 className="font-bold text-sm text-[#211B18]">SMS & OTP Dispatch Provider</h3>
              </div>
              <ClayBadge variant="active" label="Operational" />
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[#817A75] block">Provider</span>
                <strong className="text-[#211B18]">
                  {settings?.smsGateway?.provider || 'Dove SMS / ExpertSkill (Mobicomm API)'}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Registered Sender ID (DLT)</span>
                <strong className="text-[#211B18] font-mono">
                  {settings?.smsGateway?.senderId || 'EXTSKL'}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Approved DLT Message Template</span>
                <code className="block p-2 rounded-lg bg-[#FAF6F3] border border-[#F1E7E0] text-[11px] text-[#211B18] mt-1">
                  {settings?.smsGateway?.template || 'Your Verification Code for login is {OTP}. - Expertskill Technology.'}
                </code>
              </div>
            </div>
          </ClayCard>

          {/* Email Service */}
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-[#211B18]">SMTP Transactional Email Gateway</h3>
              </div>
              <ClayBadge variant="active" label="Operational" />
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[#817A75] block">Provider Protocol</span>
                <strong className="text-[#211B18]">{settings?.emailService?.provider || 'SMTP Transporter'}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">SMTP Host & Port</span>
                <strong className="text-[#211B18] font-mono">
                  {settings?.emailService?.host || 'smtp.gmail.com:587 (TLS/STARTTLS)'}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Verified Sender Identity</span>
                <strong className="text-[#211B18]">
                  {settings?.emailService?.from || 'DFarm Platform <noreply@dfarm.in>'}
                </strong>
              </div>
            </div>
          </ClayCard>

          {/* SaaS & AMC Payment Boundary */}
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-[#211B18]">Razorpay Payment Gateway Scope</h3>
              </div>
              <ClayBadge variant="active" label="Enforced" />
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[#817A75] block">Permitted Scope</span>
                <strong className="text-[#211B18]">
                  {settings?.razorpaySaaS?.scope || 'Platform SaaS Subscriptions & AMC Maintenance Billing'}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-1">
                <span className="font-bold block">Hard Boundary Enforcement:</span>
                <p>
                  {settings?.razorpaySaaS?.farmerPayoutBoundary ||
                    'Razorpay is strictly excluded from farmer milk procurement payouts, ledger deductions, and dairy-farmer settlements.'}
                </p>
              </div>
            </div>
          </ClayCard>

          {/* Security & Access Policies */}
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-[#211B18]">Platform Security Guardrails</h3>
              </div>
              <ClayBadge variant="active" label="Enforced" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#817A75] block">API Rate Limiting</span>
                <strong className="text-[#211B18] font-mono">
                  {settings?.securityPolicies?.rateLimit || '100 requests / 60s'}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Session Token TTL</span>
                <strong className="text-[#211B18] font-mono">
                  {settings?.securityPolicies?.sessionTtl || '24 hours'}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Token Signature</span>
                <strong className="text-[#211B18]">HMAC-SHA256 Signed</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Secret Encryption</span>
                <strong className="text-[#211B18]">AES-256-GCM / PBKDF2</strong>
              </div>
            </div>
          </ClayCard>
        </div>
      )}
    </div>
  )
}
export default PlatformSettingsPage
