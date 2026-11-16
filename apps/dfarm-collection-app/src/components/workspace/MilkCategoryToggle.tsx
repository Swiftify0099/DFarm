import React from 'react'
import type { MilkCategory } from '@/types'
import { CowIntakeVisual, BuffaloIntakeVisual } from '@/assets/illustrations'

interface MilkCategoryToggleProps {
  selectedCategory: MilkCategory
  onSelectCategory: (category: MilkCategory) => void
}

export const MilkCategoryToggle: React.FC<MilkCategoryToggleProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Cow Option */}
      <button
        type="button"
        onClick={() => onSelectCategory('COW')}
        className={`p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${
          selectedCategory === 'COW'
            ? 'bg-gradient-to-r from-orange-50 to-peach/70 border-primary-orange shadow-md scale-[1.01]'
            : 'bg-cream border-border-subtle hover:bg-peach/30'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center border border-border-subtle shadow-sm">
            <CowIntakeVisual size={28} />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-text-primary">Cow Milk</h4>
            <p className="text-[11px] text-text-muted">Base Rate: ₹38.50 / L</p>
          </div>
        </div>

        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            selectedCategory === 'COW'
              ? 'border-primary-orange bg-primary-orange'
              : 'border-border-subtle'
          }`}
        >
          {selectedCategory === 'COW' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </button>

      {/* Buffalo Option */}
      <button
        type="button"
        onClick={() => onSelectCategory('BUFFALO')}
        className={`p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${
          selectedCategory === 'BUFFALO'
            ? 'bg-gradient-to-r from-orange-50 to-peach/70 border-primary-orange shadow-md scale-[1.01]'
            : 'bg-cream border-border-subtle hover:bg-peach/30'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center border border-border-subtle shadow-sm">
            <BuffaloIntakeVisual size={28} />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-text-primary">Buffalo Milk</h4>
            <p className="text-[11px] text-text-muted">Base Rate: ₹58.00 / L</p>
          </div>
        </div>

        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            selectedCategory === 'BUFFALO'
              ? 'border-primary-orange bg-primary-orange'
              : 'border-border-subtle'
          }`}
        >
          {selectedCategory === 'BUFFALO' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </button>
    </div>
  )
}
