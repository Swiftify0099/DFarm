import React from 'react'

interface BrandLogoProps {
  className?: string
  showPlatformBadge?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  showPlatformBadge = true,
  size = 'md',
}) => {
  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  }[size]

  const textSize = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  }[size]

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* 3D Claymorphic DFarm Emblem */}
      <div
        className={`${iconDimensions} rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden`}
        style={{
          background: 'linear-gradient(135deg, #FF7B1A 0%, #FF6A00 50%, #E65500 100%)',
          boxShadow:
            '0 6px 14px -2px rgba(255, 106, 0, 0.4), inset 0 2px 2px 0 rgba(255, 255, 255, 0.65), inset 0 -2px 3px 0 rgba(160, 50, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
        }}
      >
        {/* Soft bevel lighting */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/40 pointer-events-none" />

        {/* Vector Cow / Milk Drop Geometry */}
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-5/6 h-5/6 text-white drop-shadow-sm"
        >
          <path
            d="M16 4C16 4 9 13.5 9 18.5C9 22.642 12.134 26 16 26C19.866 26 23 22.642 23 18.5C23 13.5 16 4 16 4Z"
            fill="white"
            fillOpacity="0.95"
          />
          <path
            d="M16 12C16 12 12 16.5 12 19.5C12 21.433 13.791 23 16 23C18.209 23 20 21.433 20 19.5C20 16.5 16 12 16 12Z"
            fill="#FFE9DC"
          />
          <circle cx="16" cy="19.5" r="2" fill="#FF6A00" />
        </svg>
      </div>

      {/* Brand Logotype & Platform Title */}
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span className={`font-black tracking-tight text-[#211B18] ${textSize}`}>
            DFarm
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] inline-block animate-pulse" />
        </div>
        {showPlatformBadge && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#817A75] mt-0.5">
            Super Admin Web
          </span>
        )}
      </div>
    </div>
  )
}
