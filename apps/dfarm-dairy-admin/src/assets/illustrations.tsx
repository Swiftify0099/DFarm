import React from 'react'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
}

// Brand Logo: DFarm emblem with stylized milk drop and sunrise leaf
export const DfarmLogo: React.FC<IconProps> = ({ size = 36, className = '', ...props }) => (
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
      d="M24 8C24 8 13 22 13 29C13 35.0751 17.9249 40 24 40C30.0751 40 35 35.0751 35 29C35 22 24 8 24 8Z"
      fill="url(#dfarm-logo-grad)"
    />
    <path
      d="M24 16C24 16 17 25 17 30C17 33.866 20.134 37 24 37C27.866 37 31 33.866 31 30C31 25 24 16 24 16Z"
      fill="#FFFFFF"
      fillOpacity="0.88"
    />
    <path
      d="M24 22C24 22 20 27 20 30.5C20 32.7091 21.7909 34.5 24 34.5C26.2091 34.5 28 32.7091 28 30.5C28 27 24 22 24 22Z"
      fill="#FF6A00"
    />
    <defs>
      <linearGradient id="dfarm-logo-grad" x1="13" y1="8" x2="35" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF6A00" />
        <stop offset="1" stopColor="#F58A38" />
      </linearGradient>
    </defs>
  </svg>
)

// Cow Visual: Original stylized cow silhouette asset
export const CowVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
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
    <path
      d="M10 20C10 20 11 23 15 23C19 23 20 20 20 20"
      stroke="#FF6A00"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path d="M5 10L8 12M25 10L22 12" stroke="#817A75" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// Buffalo Visual: Original stylized buffalo silhouette asset with distinctive curved horns
export const BuffaloVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
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
    {/* Buffalo Horns */}
    <path
      d="M5 8C8 6 12 7 14 10C16 7 20 6 23 8"
      stroke="#211B18"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Head */}
    <path
      d="M9 12C9 10.8954 9.89543 10 11 10H17C18.1046 10 19 10.8954 19 12V16C19 19.3137 16.3137 22 13 22H11C9.68629 22 9 19.3137 9 16V12Z"
      fill="#4A413D"
    />
    <circle cx="12" cy="14" r="1.5" fill="#FFFFFF" />
    <circle cx="16" cy="14" r="1.5" fill="#FFFFFF" />
    <ellipse cx="14" cy="19" rx="3.5" ry="2" fill="#211B18" />
  </svg>
)

// Milk Churn / Can Visual: Traditional and modern milk collection churn
export const MilkCanVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="10" y="4" width="12" height="3" rx="1.5" fill="#817A75" />
    <path d="M12 7L9 11H23L20 7H12Z" fill="#D4C3B7" />
    <rect x="8" y="11" width="16" height="16" rx="3" fill="#FFE9DC" stroke="#F58A38" strokeWidth="1.5" />
    <rect x="11" y="14" width="10" height="2" rx="1" fill="#FF6A00" />
    <path d="M6 13C6 11 8 11 8 11M26 13C26 11 24 11 24 11" stroke="#817A75" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// Biometric Face Scan: Representing OpenCV YuNet & SFace ONNX pipeline
export const FaceBiometricVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    {/* Frame corners */}
    <path d="M6 10V6H10M22 6H26V10M26 22V26H22M10 26H6V22" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
    {/* Head outline */}
    <path
      d="M16 9C12.6863 9 10 11.6863 10 15C10 18.5 13 22 16 23C19 22 22 18.5 22 15C22 11.6863 19.3137 9 16 9Z"
      fill="#FFE9DC"
      stroke="#F58A38"
      strokeWidth="1.5"
    />
    <circle cx="13.5" cy="14" r="1.25" fill="#211B18" />
    <circle cx="18.5" cy="14" r="1.25" fill="#211B18" />
    <path d="M14.5 18C15 19 17 19 17.5 18" stroke="#FF6A00" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

// RFID Card Visual: Contactless card assignment
export const RfidCardVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="4" y="8" width="24" height="16" rx="3" fill="#FFFFFF" stroke="#F58A38" strokeWidth="1.5" />
    <rect x="8" y="11" width="5" height="4" rx="1" fill="#FFE9DC" stroke="#FF6A00" strokeWidth="1" />
    {/* RFID wireless waves */}
    <path d="M19 12C20.5 13.5 20.5 16.5 19 18" stroke="#FF6A00" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M22 10C24.5 12.5 24.5 17.5 22 20" stroke="#F58A38" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// Quality Analyzer / Lactometer: Fat, SNF & Density testing
export const QualityAnalyzerVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="6" y="6" width="20" height="20" rx="4" fill="#FFFFFF" stroke="#F1E7E0" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="6" stroke="#FFE9DC" strokeWidth="3" />
    <path d="M16 16L19 13" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="16" r="2" fill="#211B18" />
    <rect x="10" y="22" width="12" height="2" rx="1" fill="#10B981" />
  </svg>
)

// Feed Bag Visual: Cattle nutrition & feed inventory
export const FeedBagVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
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
      d="M8 8C8 7 9 6 11 6H21C23 6 24 7 24 8L26 25C26 26.5 24.5 27 23 27H9C7.5 27 6 26.5 6 25L8 8Z"
      fill="#FFE9DC"
      stroke="#F58A38"
      strokeWidth="1.5"
    />
    <path d="M11 6L16 9L21 6" stroke="#FF6A00" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="16" cy="16" r="4" fill="#FFFFFF" />
    <path d="M16 13V19M13 16H19" stroke="#FF6A00" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// IoT Collection Machine Visual: Smart automated dairy milk collection kiosk
export const IotMachineVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="6" y="5" width="20" height="22" rx="3" fill="#FFFFFF" stroke="#817A75" strokeWidth="1.5" />
    <rect x="9" y="8" width="14" height="8" rx="2" fill="#211B18" />
    <circle cx="12" cy="12" r="1.5" fill="#10B981" />
    <rect x="15" y="11" width="6" height="2" rx="1" fill="#10B981" />
    <circle cx="16" cy="21" r="2.5" fill="#FFE9DC" stroke="#FF6A00" strokeWidth="1.5" />
    <path d="M16 2V5" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

// Ledger Shield Visual: Financial security and server-authoritative ledger
export const LedgerShieldVisual: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
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
      d="M16 4L7 8V15C7 21 11 25.5 16 28C21 25.5 25 21 25 15V8L16 4Z"
      fill="#FFE9DC"
      stroke="#FF6A00"
      strokeWidth="1.5"
    />
    <path d="M12 16L15 19L20 13" stroke="#211B18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Empty State Visual: Clean, pleasant illustration for empty datasets
export const EmptyStateVisual: React.FC<IconProps> = ({ size = 96, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 96 96"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <circle cx="48" cy="48" r="42" fill="#FCF8F5" stroke="#F1E7E0" strokeWidth="2" strokeDasharray="6 6" />
    <rect x="28" y="32" width="40" height="32" rx="8" fill="#FFFFFF" stroke="#FFE9DC" strokeWidth="2" />
    <circle cx="48" cy="48" r="9" fill="#FFF5EE" />
    <path d="M43 48H53M48 43V53" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
