import React from 'react'

export const StarCoreLogo: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="inkCoreGrad" x1="20" y1="20" x2="236" y2="236" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8B6BF2" />
        <stop offset="52%" stopColor="#6B4CE6" />
        <stop offset="100%" stopColor="#4A6CF7" />
      </linearGradient>
      <linearGradient id="inkRingGrad" x1="36" y1="70" x2="220" y2="186" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#E6DDFB" stopOpacity="0.95" />
        <stop offset="50%" stopColor="#B9AAFF" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#9BE9EC" stopOpacity="0.9" />
      </linearGradient>
    </defs>
    <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#inkCoreGrad)" />
    <ellipse
      cx="128"
      cy="128"
      rx="92"
      ry="38"
      transform="rotate(-24 128 128)"
      stroke="url(#inkRingGrad)"
      strokeWidth="10"
    />
    <ellipse
      cx="128"
      cy="128"
      rx="82"
      ry="30"
      transform="rotate(28 128 128)"
      stroke="url(#inkRingGrad)"
      strokeWidth="6"
      strokeOpacity="0.7"
    />
    <path d="M128 66C132 102 154 124 190 128C154 132 132 154 128 190C124 154 102 132 66 128C102 124 124 102 128 66Z" fill="#FFFFFF" />
    <circle cx="186" cy="76" r="7" fill="#CBEFEE" />
  </svg>
)

export const AuroraOrbVisual: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 240 160" fill="none" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="orbAura" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#A98BFF" stopOpacity="0.95" />
        <stop offset="55%" stopColor="#7062EE" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#7062EE" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="orbRing" x1="20" y1="30" x2="220" y2="130" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.88" />
        <stop offset="50%" stopColor="#A38AFA" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#8DE5EB" stopOpacity="0.82" />
      </linearGradient>
    </defs>
    <circle cx="120" cy="80" r="68" fill="url(#orbAura)" />
    <circle cx="120" cy="80" r="38" fill="url(#orbAura)" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
    <ellipse cx="120" cy="80" rx="88" ry="26" transform="rotate(-16 120 80)" stroke="url(#orbRing)" strokeWidth="3.2" />
    <ellipse cx="120" cy="80" rx="76" ry="22" transform="rotate(20 120 80)" stroke="url(#orbRing)" strokeWidth="2" strokeOpacity="0.7" />
    <path d="M120 48C123 70 130 77 152 80C130 83 123 90 120 112C117 90 110 83 88 80C110 77 117 70 120 48Z" fill="#FFFFFF" />
    <circle cx="176" cy="48" r="3.5" fill="#FFFFFF" fillOpacity="0.9" />
    <circle cx="62" cy="112" r="2.5" fill="#CBEFEE" />
  </svg>
)

export const AuroraBackdrop: React.FC<{ intensity?: 'hero' | 'subtle' }> = ({ intensity = 'hero' }) => (
  <div
    className="pointer-events-none fixed inset-0 overflow-hidden z-0"
    aria-hidden="true"
  >
    <div
      className="absolute inset-0 transition-opacity duration-300"
      style={{
        background: 'var(--aurora-hero)',
        opacity: intensity === 'hero' ? 1 : 0.42
      }}
    />
    {intensity === 'hero' && (
      <svg
        className="absolute -top-16 right-0 w-[65vw] h-[420px] opacity-35"
        viewBox="0 0 900 420"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 240 C 180 120, 360 320, 560 170 C 710 60, 810 150, 900 110 L 900 0 L 0 0 Z"
          fill="url(#waveA)"
        />
        <defs>
          <linearGradient id="waveA" x1="0" y1="0" x2="900" y2="300" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9C7DF7" stopOpacity="0.24" />
            <stop offset="50%" stopColor="#6AA8FF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#8DE5EB" stopOpacity="0.20" />
          </linearGradient>
        </defs>
      </svg>
    )}
  </div>
)
