import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';
import { cssEasing, cssSpring, duration, radius } from '@chefer/tokens';

// Motion / depth tokens come from @chefer/tokens (docs/audit-2026-09/
// motion-system.md §2.2), shared with the mobile app — no magic ms numbers.
const ms = (n: number) => `${n}ms`;

const config: Config = {
  darkMode: ['class'],
  // hover: styles only on devices that can hover (pointer: fine), so a tap on
  // a phone never leaves a button stuck in its hover colour (MO-01).
  future: { hoverOnlyWhenSupported: true },
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Role-named radii (§2.4) — same px as the size-named ones they replace.
        inner: `${radius.inner}px`,
        control: `${radius.control}px`,
        card: `${radius.card}px`,
        sheet: `${radius.sheet}px`,
      },
      // tailwindcss-animate reads these too, so `animate-in duration-slow
      // ease-enter` sets the ANIMATION duration/curve from the same tokens.
      transitionDuration: {
        instant: ms(duration.instant),
        fast: ms(duration.fast),
        base: ms(duration.base),
        slow: ms(duration.slow),
        deliberate: ms(duration.deliberate),
      },
      transitionTimingFunction: {
        standard: cssEasing('standard'),
        enter: cssEasing('enter'),
        exit: cssEasing('exit'),
        'spring-snappy': cssSpring.snappy.fn,
        'spring-gentle': cssSpring.gentle.fn,
        'spring-bouncy': cssSpring.bouncy.fn,
      },
      // Elevation (§2.3): warm-tinted two-layer shadows as CSS variables in
      // globals.css, so dark mode is a variable swap, not a component change.
      boxShadow: {
        e1: 'var(--elevation-1)',
        e2: 'var(--elevation-2)',
        e3: 'var(--elevation-3)',
        e4: 'var(--elevation-4)',
        'e4-up': 'var(--elevation-4-up)',
      },
      spacing: {
        // Height of the mobile bottom tab bar. Page content reserves this much
        // bottom padding below `lg` so nothing hides behind the bar.
        nav: '4rem',
        // Bottom tab bar height + the iOS home-indicator inset.
        'nav-safe': 'calc(4rem + env(safe-area-inset-bottom))',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...fontFamily.mono],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Exercise detail's start/end photo loop (gym_plan.md §1.3, §5.5). Two
        // stacked images, each fading in and out a half-cycle apart so the
        // photo underneath is always the one that just faded out.
        'gym-photo-a': {
          '0%, 45%': { opacity: '1' },
          '50%, 95%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'gym-photo-b': {
          '0%, 45%': { opacity: '0' },
          '50%, 95%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'gym-photo-a': 'gym-photo-a 4s ease-in-out infinite',
        'gym-photo-b': 'gym-photo-b 4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
