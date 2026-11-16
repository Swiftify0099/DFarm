import React from 'react'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
}

// DFarm Collection Brand Logo: Milk intake drop with integrated digital scan wave
export const DfarmCollectionLogo: React.FC<IconProps> = ({ size = 36, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect width="48" height="48" rx="14" fill="#FFE9DC" />
    <path
      d="M24 7C24 7 13 21 13 29C13 35.0751 17.9249 40 24 40C30.0751 40 35 35.0751 35 29C35 21 24 7 24 7Z"
      fill="url(#dfarm-coll-grad)"
    />
    <path
      d="M24 16C24 16 18 24 18 29.5C18 32.8 20.7 35.5 24 35.5C27.3 35.5 30 32.8 30 29.5C30 24 24 16 24 16Z"
      fill="#FFFFFF"
      fillOpacity="0.85"
    />
    {/* Digital Scan Waves */}
    <path d="M16 26C18 24 22 24 24 26" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
    <path d="M24 26C26 24 30 24 32 26" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
    <circle cx="24" cy="30" r="2.5" fill="#FF6A00" />
    <defs>
      <linearGradient id="dfarm-coll-grad" x1="13" y1="7" x2="35" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF6A00" />
        <stop offset="1" stopColor="#F58A38" />
      </linearGradient>
    </defs>
  </svg>
)

// Face Scanner Reticle representing OpenCV YuNet detection bounding box and landmark detection
export const FaceScannerReticle: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    {/* 4 Corner Targeting Reticles */}
    <path d="M5 10V5H10M22 5H27V10M27 22V27H22M10 27H5V22" stroke="#FF6A00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {/* Oval Facial Silhouette */}
    <ellipse cx="16" cy="16" rx="7.5" ry="9" stroke="#F58A38" strokeWidth="1.5" strokeDasharray="2 2" />
    {/* 5 Facial Landmarks (OpenCV YuNet: Left Eye, Right Eye, Nose Tip, Left Mouth Corner, Right Mouth Corner) */}
    <circle cx="13.5" cy="14" r="1.2" fill="#00E5FF" />
    <circle cx="18.5" cy="14" r="1.2" fill="#00E5FF" />
    <circle cx="16" cy="17" r="1" fill="#00E5FF" />
    <circle cx="14" cy="20" r="1" fill="#00E5FF" />
    <circle cx="18" cy="20" r="1" fill="#00E5FF" />
  </svg>
)

// Contactless RFID Wave Visual
export const RfidWaveVisual: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="3" y="7" width="26" height="18" rx="3.5" fill="#FFFFFF" stroke="#F58A38" strokeWidth="1.5" />
    <rect x="7" y="11" width="6" height="5" rx="1.5" fill="#FFE9DC" stroke="#FF6A00" strokeWidth="1" />
    <path d="M18 12C19.8 13.8 19.8 17.2 18 19" stroke="#FF6A00" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M21.5 9.5C24.5 12.5 24.5 18.5 21.5 21.5" stroke="#F58A38" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

// Cow Intake Visual: Stylized golden cattle silhouette
export const CowIntakeVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect width="32" height="32" rx="8" fill="#FFF5EE" />
    <path
      d="M7 11C7 9.89543 7.89543 9 9 9H13L15 6L17 9H21C22.1046 9 23 9.89543 23 11V14C23 17.3137 20.3137 20 17 20H13C9.68629 20 7 17.3137 7 14V11Z"
      fill="#F58A38"
    />
    <circle cx="11.5" cy="13.5" r="1.5" fill="#211B18" />
    <circle cx="18.5" cy="13.5" r="1.5" fill="#211B18" />
    <path d="M10 20C10 20 11 23 15 23C19 23 20 20 20 20" stroke="#FF6A00" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5 10L8 12M25 10L22 12" stroke="#817A75" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// Buffalo Intake Visual: High-fat buffalo with distinct curved horns
export const BuffaloIntakeVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect width="32" height="32" rx="8" fill="#F1E7E0" />
    <path d="M5 8C8 6 12 7 14 10C16 7 20 6 23 8" stroke="#211B18" strokeWidth="2.5" strokeLinecap="round" />
    <path
      d="M9 12C9 10.8954 9.89543 10 11 10H17C18.1046 10 19 10.8954 19 12V16C19 19.3137 16.3137 22 13 22H11C9.68629 22 9 19.3137 9 16V12Z"
      fill="#4A413D"
    />
    <circle cx="12" cy="14" r="1.5" fill="#FFFFFF" />
    <circle cx="16" cy="14" r="1.5" fill="#FFFFFF" />
    <ellipse cx="14" cy="19" rx="3.5" ry="2" fill="#211B18" />
  </svg>
)

// Lactometer Ultrasonic Analyzer Visual (Fat & SNF measurement)
export const LactometerAnalyzerVisual: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="5" y="5" width="22" height="22" rx="4" fill="#FFFFFF" stroke="#F1E7E0" strokeWidth="1.5" />
    <circle cx="16" cy="15" r="6" stroke="#FFE9DC" strokeWidth="2.5" />
    <path d="M16 15L19 12" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="15" r="2" fill="#211B18" />
    {/* Sample test tube intake port */}
    <rect x="13.5" y="22" width="5" height="4" rx="1" fill="#10B981" />
  </svg>
)

// Digital Weighing Scale Visual (Live gross/tare weight)
export const WeighingScaleVisual: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    {/* Weighing Platform */}
    <rect x="4" y="20" width="24" height="6" rx="2" fill="#817A75" stroke="#211B18" strokeWidth="1.2" />
    <line x1="8" y1="26" x2="8" y2="28" stroke="#211B18" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="26" x2="24" y2="28" stroke="#211B18" strokeWidth="2" strokeLinecap="round" />
    {/* Pole and Display Indicator */}
    <rect x="15" y="8" width="2" height="12" fill="#817A75" />
    <rect x="9" y="4" width="14" height="9" rx="2" fill="#FFFFFF" stroke="#FF6A00" strokeWidth="1.5" />
    <rect x="11" y="6" width="10" height="4" rx="1" fill="#211B18" />
    <circle cx="13" cy="8" r="0.75" fill="#10B981" />
    <circle cx="16" cy="8" r="0.75" fill="#10B981" />
    <circle cx="19" cy="8" r="0.75" fill="#10B981" />
  </svg>
)

// Sync Cloud Visual: Bidirectional offline-first sync
export const SyncCloudVisual: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M9 20C6.5 20 4.5 18 4.5 15.5C4.5 13.2 6.1 11.3 8.3 11.1C9.1 7.6 12.2 5 16 5C20.3 5 23.8 8.1 24.3 12.3C26.4 12.8 28 14.7 28 17C28 19.8 25.8 22 23 22H9"
      stroke="#FF6A00"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path d="M13 25L16 28L19 25M16 19V28" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Collection Receipt Printer Voucher Visual
export const ReceiptPrinterVisual: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="6" y="6" width="20" height="12" rx="2" fill="#FFFFFF" stroke="#817A75" strokeWidth="1.5" />
    <line x1="9" y1="11" x2="23" y2="11" stroke="#211B18" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 18V26L11 24L14 26L17 24L20 26L23 24L24 26V18H8Z" fill="#FFF5EE" stroke="#F58A38" strokeWidth="1.2" />
    <line x1="11" y1="20" x2="19" y2="20" stroke="#FF6A00" strokeWidth="1" strokeLinecap="round" />
  </svg>
)

// Empty State Visual
export const EmptyCollectionVisual: React.FC<IconProps> = ({ size = 80, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <circle cx="40" cy="40" r="36" fill="#FCF8F5" stroke="#F1E7E0" strokeWidth="1.5" strokeDasharray="5 5" />
    <rect x="24" y="26" width="32" height="28" rx="6" fill="#FFFFFF" stroke="#FFE9DC" strokeWidth="1.5" />
    <circle cx="40" cy="40" r="8" fill="#FFF5EE" />
    <path d="M36 40H44M40 36V44" stroke="#FF6A00" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
