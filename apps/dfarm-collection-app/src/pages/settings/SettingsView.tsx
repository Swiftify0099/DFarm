import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { voiceAnnouncer } from '@/drivers/VoiceAnnouncerDriver'
import { ClayCard, ClayButton, ClayBadge, ConfirmationModal } from '@/components/ui'
import { Settings, Volume2, ShieldCheck, Database, Sliders, Check } from 'lucide-react'

export const SettingsView: React.FC = () => {
  const { operator } = useAuth()
  const [testSpeechStatus, setTestSpeechStatus] = useState<string | null>(null)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)

  const handleTestVoiceAnnouncer = () => {
    const success = voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    if (success) {
      setTestSpeechStatus('Speech synthesis initiated: "Pandurang Mahadev Patil"')
    } else {
      setTestSpeechStatus('Debounced: identical patron called within 8s lockout window.')
    }
    setTimeout(() => setTestSpeechStatus(null), 3000)
  }

  const handleResetLocalDatabase = () => {
    indexedDB.deleteDatabase('dfarm_collection_local_db')
    window.location.reload()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center space-x-2">
          <Settings className="w-5 h-5 text-primary-orange" />
          <h2 className="text-xl font-bold text-text-primary">Kiosk Terminal Settings (F6)</h2>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Device configuration, hardware voice synthesizer testing, rate charts, and storage management.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Dairy Tenant Identity Card */}
        <ClayCard className="p-5 bg-cream space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-border-subtle">
            <ShieldCheck className="w-5 h-5 text-primary-orange" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
              Dairy Tenant Association
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-border-subtle/50">
              <span className="text-text-muted">Registered Dairy:</span>
              <span className="font-bold text-text-primary">
                {operator?.dairyName || 'Gokul Dairy Farmers Cooperative'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border-subtle/50">
              <span className="text-text-muted">Dairy Code:</span>
              <span className="font-mono font-bold text-primary-orange">
                {operator?.dairyCode || 'DF-GOKUL-01'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border-subtle/50">
              <span className="text-text-muted">Tenant UUID:</span>
              <span className="font-mono text-text-muted">{operator?.dairyId || 'dairy-ten-9801'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border-subtle/50">
              <span className="text-text-muted">Terminal Identifier:</span>
              <span className="font-mono font-bold text-text-primary">DF-KIOSK-001</span>
            </div>
          </div>
        </ClayCard>

        {/* Voice Announcer Driver Testing */}
        <ClayCard className="p-5 bg-cream space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-border-subtle">
            <Volume2 className="w-5 h-5 text-primary-orange" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
              Voice Announcer Driver
            </h3>
          </div>

          <div className="space-y-2 text-xs text-text-secondary">
            <p>
              Interfaces with browser Web Speech API with an 8-second frame debounce window to prevent
              continuous chatter on live camera frames.
            </p>
            <div className="p-3 bg-peach/30 rounded-xl border border-border-subtle space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Language & Voice:</span>
                <span className="font-bold text-text-primary">en-IN (Indian English / Marathi)</span>
              </div>
              <div className="flex justify-between">
                <span>Debounce Window:</span>
                <span className="font-bold text-text-primary">8000 ms</span>
              </div>
            </div>
          </div>

          {testSpeechStatus && (
            <div className="p-2.5 rounded-xl bg-orange-50 border border-primary-orange/30 text-primary-orange text-xs">
              {testSpeechStatus}
            </div>
          )}

          <ClayButton
            variant="secondary"
            size="sm"
            onClick={handleTestVoiceAnnouncer}
            className="flex items-center space-x-1.5 text-xs w-full justify-center"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Test Customer Announcement Audio</span>
          </ClayButton>
        </ClayCard>

        {/* Rate Chart Formulas */}
        <ClayCard className="p-5 bg-cream space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-border-subtle">
            <Sliders className="w-5 h-5 text-primary-orange" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
              Two-Axis Rate Formulas
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-cream-dark rounded-xl border border-border-subtle space-y-1">
              <span className="font-bold text-text-primary block">Cow Milk Formula (Rate Chart v2):</span>
              <p className="font-mono text-[11px] text-text-secondary">
                Rate = ₹38.50 + (Fat - 3.5) × 4.20 + (SNF - 8.5) × 3.50
              </p>
            </div>

            <div className="p-3 bg-cream-dark rounded-xl border border-border-subtle space-y-1">
              <span className="font-bold text-text-primary block">Buffalo Milk Formula (Rate Chart v1):</span>
              <p className="font-mono text-[11px] text-text-secondary">
                Rate = ₹58.00 + (Fat - 3.5) × 4.20 + (SNF - 8.5) × 3.50
              </p>
            </div>
          </div>
        </ClayCard>

        {/* Local Storage & Cache Maintenance */}
        <ClayCard className="p-5 bg-cream space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-border-subtle">
            <Database className="w-5 h-5 text-primary-orange" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
              IndexedDB Maintenance
            </h3>
          </div>

          <p className="text-xs text-text-secondary">
            Manage local datastore cache: patron biometric embeddings, completed transaction journal, and
            offline sync queues.
          </p>

          <div className="pt-2">
            <ClayButton
              variant="outline"
              size="sm"
              onClick={() => setIsResetModalOpen(true)}
              className="w-full text-xs text-rose-700 hover:border-rose-400 hover:bg-rose-50"
            >
              Purge Local IndexedDB Datastore
            </ClayButton>
          </div>
        </ClayCard>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetLocalDatabase}
        title="Purge Local Datastore"
        message="This will delete the local IndexedDB database and reload the terminal. All unsynced offline records will be purged."
        confirmText="Confirm Purge"
        variant="danger"
      />
    </div>
  )
}
