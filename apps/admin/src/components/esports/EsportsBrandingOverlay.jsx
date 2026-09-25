import { memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEsportsTheme } from '../../context/EsportsThemeContext.jsx'
import { useSkin } from '../../context/SkinContext.jsx'

/**
 * Skin Configuration Profiles
 * Customized cyber telemetry, colors, and geometric accents for each skin
 */
const SKIN_CONFIGS = {
  nexus: {
    id: 'nexus',
    name: 'NEXUS HOUSE',
    badge: 'NEXUS-HOUSE // CORE',
    code: 'SYS.NX-9900',
    primary: '#7B61FF',
    secondary: '#2ED3A0',
    accent: '#4CC2FF',
    tagline: 'AEZAKMI CLOUD // DUAL ENGINE',
    polling: '1000Hz ULTRA',
    symbol: 'N',
    geoVariant: 'rings',
  },
  victus: {
    id: 'victus',
    name: 'VICTUS PERFORMANCE',
    badge: 'VICTUS-V // APEX',
    code: 'SYS.VC-7700',
    primary: '#0096D6',
    secondary: '#3FD6B0',
    accent: '#59C2FF',
    tagline: 'DYNAMIC PERFORMANCE MATRIX',
    polling: '240Hz PRO',
    symbol: 'V',
    geoVariant: 'chamfer',
  },
  alien: {
    id: 'alien',
    name: 'ALIENWARE FX',
    badge: 'ALIEN-FX // CRYOTECH',
    code: 'SYS.ALN-01X',
    primary: '#00CFE5',
    secondary: '#3BE8C0',
    accent: '#7C8CFF',
    tagline: 'SPACE FX AMBIENT CORE',
    polling: '360Hz APEX',
    symbol: '◉',
    geoVariant: 'honeycomb',
  },
  rog: {
    id: 'rog',
    name: 'ROG STRIX',
    badge: 'ROG-STRIX // HAZARD',
    code: 'SYS.ROG-X870',
    primary: '#DE272C',
    secondary: '#D4A33A',
    accent: '#FF4D4D',
    tagline: 'FOR THOSE WHO DARE',
    polling: '540Hz ULTRA',
    symbol: '//',
    geoVariant: 'hazard',
  },
  razer: {
    id: 'razer',
    name: 'RAZER CHROMA',
    badge: 'CHROMA // HYPERSPEED',
    code: 'SYS.RZ-PRO',
    primary: '#44D62C',
    secondary: '#00E0FF',
    accent: '#FFAA00',
    tagline: 'FOR GAMERS. BY GAMERS.',
    polling: '1000Hz SPEED',
    symbol: '≡',
    geoVariant: 'chroma',
  },
  predator: {
    id: 'predator',
    name: 'PREDATOR HELIOS',
    badge: 'PREDATOR-X // AEROBLADE',
    code: 'SYS.PRD-900',
    primary: '#0BC5C0',
    secondary: '#FF7A18',
    accent: '#4FD8F0',
    tagline: 'CHISELED TARGETING ENGINE',
    polling: '300Hz APEX',
    symbol: '▲',
    geoVariant: 'angular',
  },
}

/**
 * Animated Vector Aezakmi Esports Signature Crest / HUD Watermark
 */
const AezakmiCrest = memo(function AezakmiCrest({ skin }) {
  return (
    <div className="relative flex items-center justify-center w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] select-none pointer-events-none opacity-25 dark:opacity-35 transition-opacity duration-700">
      {/* Outer Gyro Ring 1 - Clockwise */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 440 440"
        fill="none"
        animate={{ rotate: 360 }}
        transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
      >
        <circle
          cx="220"
          cy="220"
          r="210"
          stroke={skin.primary}
          strokeWidth="1.2"
          strokeDasharray="4 8 20 8 60 12"
          strokeOpacity="0.45"
        />
        <circle
          cx="220"
          cy="220"
          r="198"
          stroke={skin.secondary}
          strokeWidth="1"
          strokeDasharray="1 14"
          strokeOpacity="0.4"
        />
        {/* Reticle Tick Badges */}
        <line x1="220" y1="5" x2="220" y2="18" stroke={skin.primary} strokeWidth="2.5" strokeOpacity="0.8" />
        <line x1="220" y1="422" x2="220" y2="435" stroke={skin.primary} strokeWidth="2.5" strokeOpacity="0.8" />
        <line x1="5" y1="220" x2="18" y2="220" stroke={skin.primary} strokeWidth="2.5" strokeOpacity="0.8" />
        <line x1="422" y1="220" x2="435" y2="220" stroke={skin.primary} strokeWidth="2.5" strokeOpacity="0.8" />
      </motion.svg>

      {/* Middle Gyro Ring 2 - Counter-Clockwise */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 440 440"
        fill="none"
        animate={{ rotate: -360 }}
        transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
      >
        <circle
          cx="220"
          cy="220"
          r="170"
          stroke={skin.accent}
          strokeWidth="1.5"
          strokeDasharray="12 18 36 18"
          strokeOpacity="0.5"
        />
        <circle
          cx="220"
          cy="220"
          r="154"
          stroke={skin.primary}
          strokeWidth="0.8"
          strokeDasharray="3 6"
          strokeOpacity="0.3"
        />
        {/* Corner 45-degree cyber brackets */}
        <path
          d="M100 100 L115 100 M100 100 L100 115"
          stroke={skin.primary}
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
        <path
          d="M340 100 L325 100 M340 100 L340 115"
          stroke={skin.primary}
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
        <path
          d="M100 340 L115 340 M100 340 L100 325"
          stroke={skin.primary}
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
        <path
          d="M340 340 L325 340 M340 340 L340 325"
          stroke={skin.primary}
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
      </motion.svg>

      {/* Inner Static / Breathing Geometric Emblem */}
      <motion.div
        className="relative flex flex-col items-center justify-center text-center"
        animate={{ scale: [0.97, 1.03, 0.97] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
          <defs>
            <linearGradient id={`esports-grad-${skin.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={skin.primary} />
              <stop offset="50%" stopColor={skin.secondary} />
              <stop offset="100%" stopColor={skin.accent} />
            </linearGradient>
            <filter id={`esports-glow-${skin.id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Outer Cyber Hexagon / Octagon */}
          <polygon
            points="70,12 118,38 118,102 70,128 22,102 22,38"
            stroke={`url(#esports-grad-${skin.id})`}
            strokeWidth="2"
            fill="none"
            strokeOpacity="0.7"
            filter={`url(#esports-glow-${skin.id})`}
          />

          {/* Inner Monogram Apex "A" Shape */}
          <path
            d="M70 32 L102 98 L85 98 L78 82 L62 82 L55 98 L38 98 Z M70 56 L65 72 L75 72 Z"
            fill={`url(#esports-grad-${skin.id})`}
            fillOpacity="0.85"
          />

          {/* Core Central Power Diamond */}
          <polygon
            points="70,44 76,52 70,60 64,52"
            fill="#FFFFFF"
            opacity="0.9"
          />

          {/* Cyber Target Cross */}
          <line x1="70" y1="2" x2="70" y2="18" stroke={skin.secondary} strokeWidth="1.5" />
          <line x1="70" y1="122" x2="70" y2="138" stroke={skin.secondary} strokeWidth="1.5" />
          <line x1="2" y1="70" x2="18" y2="70" stroke={skin.secondary} strokeWidth="1.5" />
          <line x1="122" y1="70" x2="138" y2="70" stroke={skin.secondary} strokeWidth="1.5" />
        </svg>

        {/* Tactical Monospace Labels */}
        <div className="mt-2.5 flex flex-col items-center select-none">
          <span
            className="text-[12px] font-black tracking-[0.3em] uppercase leading-none"
            style={{ color: skin.primary, textShadow: `0 0 12px ${skin.primary}80` }}
          >
            AEZAKMI
          </span>
          <span className="text-[8px] font-mono font-bold tracking-[0.2em] text-slate-400 mt-1 uppercase">
            ESPORTS CORE // {skin.symbol}
          </span>
        </div>
      </motion.div>
    </div>
  )
})

/**
 * Tactical Corner HUD Bracket
 */
const TacticalCorner = memo(function TacticalCorner({ position, skin }) {
  const isTop = position.includes('top')
  const isLeft = position.includes('left')

  return (
    <div
      className={`absolute z-0 pointer-events-none select-none p-4 hidden md:flex flex-col ${
        isTop ? 'top-14 lg:top-3' : 'bottom-16 lg:bottom-3'
      } ${isLeft ? 'left-3 items-start' : 'right-3 items-end'}`}
    >
      {/* Corner Bracket SVG */}
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="opacity-40">
        <path
          d={
            isTop && isLeft
              ? 'M1 28 L1 1 L28 1 M7 7 L7 18 M7 7 L18 7'
              : isTop && !isLeft
              ? 'M43 28 L43 1 L16 1 M37 7 L37 18 M37 7 L26 7'
              : !isTop && isLeft
              ? 'M1 16 L1 43 L28 43 M7 37 L7 26 M7 37 L18 37'
              : 'M43 16 L43 43 L16 43 M37 37 L37 26 M37 37 L26 37'
          }
          stroke={skin.primary}
          strokeWidth="1.8"
          strokeLinecap="square"
        />
        {/* Corner accent node */}
        <circle
          cx={isLeft ? 4 : 40}
          cy={isTop ? 4 : 40}
          r="2"
          fill={skin.secondary}
        />
      </svg>

      {/* Telemetry metadata badge */}
      {isTop && isLeft && (
        <div className="mt-1.5 flex flex-col gap-0.5 opacity-40 font-mono text-[8px] tracking-wider text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: skin.secondary }} />
            <span className="font-bold text-slate-300">{skin.badge}</span>
          </div>
          <span>LINK: ULTRA-LOW LATENCY &lt;0.4ms</span>
        </div>
      )}

      {isTop && !isLeft && (
        <div className="mt-1.5 flex flex-col items-end gap-0.5 opacity-40 font-mono text-[8px] tracking-wider text-slate-400">
          <span className="font-bold text-slate-300">{skin.polling}</span>
          <span>SYS.SYNC: {skin.code}</span>
        </div>
      )}

      {!isTop && isLeft && (
        <div className="mb-1.5 order-first flex flex-col gap-0.5 opacity-35 font-mono text-[7.5px] tracking-wider text-slate-400">
          <div className="flex items-center gap-1">
            <span className="h-1 w-3" style={{ backgroundColor: skin.primary }} />
            <span className="h-1 w-1" style={{ backgroundColor: skin.secondary }} />
            <span className="h-1 w-1" style={{ backgroundColor: skin.accent }} />
          </div>
          <span>SEC: 07-DVO // ESPORTS MATRIX</span>
        </div>
      )}

      {!isTop && !isLeft && (
        <div className="mb-1.5 order-first flex flex-col items-end gap-0.5 opacity-35 font-mono text-[7.5px] tracking-wider text-slate-400">
          <span className="text-slate-300">AEZAKMI PRO ENGINE</span>
          <span>STATUS // OPTIMAL</span>
        </div>
      )}
    </div>
  )
})

/**
 * Animated Laser Scanline Sweep
 */
const LaserScanline = memo(function LaserScanline({ skin }) {
  return (
    <motion.div
      className="absolute inset-x-0 h-28 pointer-events-none z-0 overflow-hidden opacity-20 dark:opacity-30 select-none"
      initial={{ top: '-15%' }}
      animate={{ top: ['-15%', '115%'] }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: 'linear',
        repeatDelay: 2,
      }}
    >
      <div
        className="w-full h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${skin.primary} 30%, ${skin.secondary} 50%, ${skin.primary} 70%, transparent 100%)`,
          boxShadow: `0 0 10px ${skin.primary}`,
        }}
      />
      <div
        className="w-full h-full"
        style={{
          background: `linear-gradient(180deg, ${skin.primary}18 0%, transparent 100%)`,
        }}
      />
    </motion.div>
  )
})

/**
 * Ambient Equalizer Micro Pulse Bars (Left Edge)
 */
const MicroEqualizer = memo(function MicroEqualizer({ skin }) {
  const bars = [16, 28, 12, 34, 22, 18, 30, 14, 24, 38, 20, 10]

  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-0 hidden xl:flex flex-col gap-1 opacity-25 dark:opacity-35 pointer-events-none select-none">
      {bars.map((height, index) => (
        <motion.div
          key={index}
          className="w-1 rounded-xs"
          style={{ backgroundColor: index % 2 === 0 ? skin.primary : skin.secondary }}
          animate={{
            height: [height * 0.4, height, height * 0.5],
            opacity: [0.3, 0.9, 0.4],
          }}
          transition={{
            duration: 1.2 + (index % 4) * 0.3,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
            delay: index * 0.08,
          }}
        />
      ))}
    </div>
  )
})

/**
 * Floating Micro Energy Particles (Skin-reactive Ambient Dust)
 */
const AmbientEnergyMotes = memo(function AmbientEnergyMotes({ skin }) {
  const motes = [
    { x: '15%', y: '25%', size: 3, delay: 0, dur: 7 },
    { x: '82%', y: '18%', size: 4, delay: 1.5, dur: 9 },
    { x: '28%', y: '78%', size: 3.5, delay: 2, dur: 8 },
    { x: '75%', y: '72%', size: 3, delay: 0.8, dur: 6.5 },
    { x: '50%', y: '88%', size: 4, delay: 3, dur: 10 },
  ]

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {motes.map((mote, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: mote.x,
            top: mote.y,
            width: mote.size,
            height: mote.size,
            backgroundColor: i % 2 === 0 ? skin.primary : skin.secondary,
            boxShadow: `0 0 8px ${skin.primary}`,
          }}
          animate={{
            y: [-12, 12, -12],
            x: [-8, 8, -8],
            opacity: [0.15, 0.65, 0.15],
            scale: [0.8, 1.25, 0.8],
          }}
          transition={{
            duration: mote.dur,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: mote.delay,
          }}
        />
      ))}
    </div>
  )
})

/**
 * Main EsportsBrandingOverlay Component
 * Renders behind the viewport content strictly when Esports Mode is active.
 */
export default function EsportsBrandingOverlay() {
  const { isEsportsMode } = useEsportsTheme()
  const { skinId } = useSkin()

  const activeConfig = useMemo(() => {
    return SKIN_CONFIGS[skinId] || SKIN_CONFIGS.nexus
  }, [skinId])

  if (!isEsportsMode) return null

  return (
    <AnimatePresence>
      <motion.div
        key={`esports-overlay-${skinId}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="esports-branding-overlay fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
        aria-hidden="true"
      >
        {/* Background Cyber Glow Radials */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${activeConfig.primary}0D 0%, transparent 65%)`,
          }}
        />

        {/* 4 Tactical Corner HUD Brackets */}
        <TacticalCorner position="top-left" skin={activeConfig} />
        <TacticalCorner position="top-right" skin={activeConfig} />
        <TacticalCorner position="bottom-left" skin={activeConfig} />
        <TacticalCorner position="bottom-right" skin={activeConfig} />

        {/* Center Watermark Crest */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AezakmiCrest skin={activeConfig} />
        </div>

        {/* Vertical Laser Scanline Sweep */}
        <LaserScanline skin={activeConfig} />

        {/* Micro Equalizer Frequency Bars */}
        <MicroEqualizer skin={activeConfig} />

        {/* Floating Ambient Energy Motes */}
        <AmbientEnergyMotes skin={activeConfig} />

        {/* Bottom Perspective Cyber Grid */}
        <div
          className="absolute inset-x-0 bottom-0 h-40 opacity-15 dark:opacity-20 pointer-events-none"
          style={{
            background: `linear-gradient(to top, ${activeConfig.primary}20, transparent), repeating-linear-gradient(90deg, ${activeConfig.primary}30 0 1px, transparent 1px 40px)`,
            maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
          }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
