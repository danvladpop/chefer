import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { duration, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-18 celebration (docs/mobile-ux-revamp/motion-premium.md): a short
// confetti burst for tier-3 wins only — the day's last meal ticked, the shop
// list finished, a workout with a PR or the week goal hit. ~24 small shapes
// fly up and out from `origin`, fall under gravity and fade, all from ONE
// shared value on the UI thread, in `celebrate` (1 s). It never takes
// touches (pointerEvents none) and renders nothing under reduced motion.
// Haptics stay with the caller (`haptics.success`).

export const CELEBRATION_PARTICLES = 24;

export interface Particle {
  /** Launch velocity, pt per second. */
  vx: number;
  vy: number;
  /** Full turns over the burst. */
  spin: number;
  size: number;
  round: boolean;
  color: string;
}

/** Small deterministic PRNG (mulberry32), so a burst looks the same in tests. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The burst's particles: a fan pointing up (−155° … −25°), mixed sizes and shapes. */
export function makeParticles(colors: readonly string[], count = CELEBRATION_PARTICLES, seed = 7) {
  const rand = prng(seed);
  return Array.from({ length: count }, (_, i): Particle => {
    const angle = ((-155 + rand() * 130) * Math.PI) / 180;
    const speed = 220 + rand() * 260;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (rand() - 0.5) * 3,
      size: 6 + Math.round(rand() * 4),
      round: rand() > 0.6,
      color: colors[i % colors.length] ?? 'transparent',
    };
  });
}

/** Gravity, pt/s². */
const GRAVITY = 900;

function ParticleView({ p, progress }: { p: Particle; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const k = progress.get();
    const t = k * (duration.celebrate / 1000);
    return {
      opacity: k <= 0 || k >= 1 ? 0 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3,
      transform: [
        { translateX: p.vx * t },
        { translateY: p.vy * t + 0.5 * GRAVITY * t * t },
        { rotate: `${p.spin * 360 * k}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: p.size,
          height: p.round ? p.size : p.size * 0.5,
          marginLeft: -p.size / 2,
          marginTop: -p.size / 4,
          borderRadius: p.round ? p.size : 1.5,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}

export interface CelebrationProps {
  /** Increment to fire a burst; 0 = never fired. */
  play: number;
  /** Particle colours (2–5 work best). */
  colors: readonly string[];
  /** Burst origin as fractions of this overlay's box (default centre). */
  origin?: { x: number; y: number };
  testID?: string;
}

/**
 * Absolute overlay that fills its parent (give the parent `relative` and no
 * `overflow: hidden` if the confetti should spill out of it).
 */
export function Celebration({
  play,
  colors,
  origin = { x: 0.5, y: 0.5 },
  testID,
}: CelebrationProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const colorKey = colors.join('|');
  // Keyed by the colours' text, so an inline array literal doesn't rebuild the burst.
  const particles = useMemo(() => makeParticles(colorKey.split('|')), [colorKey]);

  useEffect(() => {
    if (play <= 0 || reduced) return;
    progress.set(0);
    progress.set(withTiming(1, timing(duration.celebrate, 'linear')));
  }, [play, reduced, progress]);

  if (play <= 0 || reduced) return null;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <View style={{ position: 'absolute', left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }}>
        {particles.map((p, i) => (
          <ParticleView key={i} p={p} progress={progress} />
        ))}
      </View>
    </View>
  );
}
