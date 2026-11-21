import React, { useState } from 'react'
import { useHardware } from '@/context/HardwareContext'
import { ClayCard, ClayButton } from '@/components/ui'
import { ReadingCard } from './ReadingCard'
import { Activity, Scale, Droplet, Sparkles, AlertCircle, RefreshCw } from 'lucide-react'

export const MeasurementPanel: React.FC = () => {
  const { measurements, updateMeasurements, tareScale, collectionWorkflowState, activeAttempt } = useHardware()
  const [isManualOverride, setIsManualOverride] = useState(false)

  const handleFatChange = (val: number) => {
    updateMeasurements({ fat: val })
  }

  const handleSnfChange = (val: number) => {
    updateMeasurements({ snf: val })
  }

  const handleWeightChange = (val: number) => {
    updateMeasurements({ weightLiters: val })
  }

  const handleClrChange = (val: number) => {
    updateMeasurements({ clrDensity: val })
  }

  const toggleScaleStability = () => {
    updateMeasurements({ scaleStable: !measurements.scaleStable })
  }

  return (
    <div className="space-y-4">
      {/* Hardware Panel Header with Tare and Manual Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-primary-orange" />
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">
            Intake Telemetry & Quality Readings
          </h2>
          {activeAttempt && (
            <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
              {collectionWorkflowState.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <ClayButton
            variant={measurements.scaleStable ? 'outline' : 'danger'}
            size="sm"
            onClick={toggleScaleStability}
            title="Toggle scale reading stabilization flag"
            className="text-xs"
          >
            Scale: {measurements.scaleStable ? 'STABLE' : 'UNSTABLE'}
          </ClayButton>

          <ClayButton
            variant="secondary"
            size="sm"
            onClick={tareScale}
            title="Zero calibrated scale reading"
            className="text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Tare Scale (0.00 L)
          </ClayButton>

          <ClayButton
            variant={isManualOverride ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setIsManualOverride(!isManualOverride)}
            className="text-xs"
          >
            {isManualOverride ? 'Manual Input Active' : 'Enable Manual Input'}
          </ClayButton>
        </div>
      </div>

      {/* 4 Digital Reading Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 1. Fat % */}
        <ReadingCard
          label="Milk Fat"
          value={measurements.fat}
          unit="%"
          icon={Droplet}
          status={measurements.fat >= 2.0 && measurements.fat <= 15.0 ? 'valid' : 'error'}
          statusNote={measurements.fat >= 2.0 && measurements.fat <= 15.0 ? 'Bio Normal' : 'Out of Bounds'}
          editable={isManualOverride}
          onChangeValue={handleFatChange}
          step={0.1}
          min={1.0}
          max={16.0}
        />

        {/* 2. SNF % */}
        <ReadingCard
          label="SNF Quality"
          value={measurements.snf}
          unit="%"
          icon={Sparkles}
          status={measurements.snf >= 6.0 && measurements.snf <= 12.0 ? 'valid' : 'error'}
          statusNote={measurements.snf >= 6.0 && measurements.snf <= 12.0 ? 'Bio Normal' : 'Out of Bounds'}
          editable={isManualOverride}
          onChangeValue={handleSnfChange}
          step={0.1}
          min={5.0}
          max={14.0}
        />

        {/* 3. CLR Density */}
        <ReadingCard
          label="CLR Density"
          value={measurements.clrDensity}
          unit="CLR"
          icon={Activity}
          status="valid"
          statusNote="Lactometer Ok"
          editable={isManualOverride}
          onChangeValue={handleClrChange}
          step={0.5}
          min={20}
          max={36}
        />

        {/* 4. Net Volume Weight */}
        <ReadingCard
          label="Net Volume"
          value={measurements.weightLiters}
          unit="Liters"
          icon={Scale}
          status={
            measurements.weightLiters > 0 && measurements.scaleStable
              ? 'valid'
              : measurements.weightLiters <= 0
              ? 'warning'
              : 'error'
          }
          statusNote={
            !measurements.scaleStable
              ? 'Stabilizing...'
              : measurements.weightLiters <= 0
              ? 'Zero Tare'
              : 'Locked'
          }
          editable={isManualOverride}
          onChangeValue={handleWeightChange}
          step={0.5}
          min={0}
          max={500}
        />
      </div>

      {/* Validation Feedback Banner if biological bounds or stability fails */}
      {measurements.validationErrors.length > 0 && (
        <ClayCard className="p-3 bg-amber-50/80 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Intake Validation Advisory: </span>
            <span>{measurements.validationErrors.join(' • ')}</span>
          </div>
        </ClayCard>
      )}
    </div>
  )
}
