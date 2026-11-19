import React from 'react'
import { ClayButton } from '@/components/ui'
import { ReceiptPrinterVisual } from '@/assets/illustrations'
import { Lock, CheckCircle2 } from 'lucide-react'

interface SaveTransactionButtonProps {
  canSubmit: boolean
  lockReason: string | null
  totalAmount: number
  isSubmitting: boolean
  onSubmit: () => void
}

export const SaveTransactionButton: React.FC<SaveTransactionButtonProps> = ({
  canSubmit,
  lockReason,
  totalAmount,
  isSubmitting,
  onSubmit,
}) => {
  return (
    <div className="space-y-2">
      <ClayButton
        variant={canSubmit ? 'primary' : 'secondary'}
        size="lg"
        onClick={onSubmit}
        disabled={!canSubmit || isSubmitting}
        className={`w-full py-4 text-base font-bold flex items-center justify-center space-x-2 transition-all ${
          canSubmit
            ? 'shadow-lg hover:shadow-xl hover:scale-[1.01]'
            : 'opacity-70 cursor-not-allowed bg-stone-200 text-stone-500'
        }`}
      >
        {isSubmitting ? (
          <>
            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span>Journaling Intake...</span>
          </>
        ) : canSubmit ? (
          <>
            <ReceiptPrinterVisual size={24} />
            <span>CONFIRM & RECORD INTAKE [Ctrl+Enter] (₹ {totalAmount.toFixed(2)})</span>
            <CheckCircle2 className="w-5 h-5 ml-1" />
          </>
        ) : (
          <>
            <Lock className="w-4 h-4 text-stone-500" />
            <span>RECORD INTAKE LOCKED</span>
          </>
        )}
      </ClayButton>

      {/* Lock Feedback Sub-caption */}
      {!canSubmit && lockReason && (
        <p className="text-center text-xs text-amber-700 font-medium bg-amber-50 py-1.5 px-3 rounded-lg border border-amber-200">
          ⚠️ {lockReason}
        </p>
      )}
    </div>
  )
}
