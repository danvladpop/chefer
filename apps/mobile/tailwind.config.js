// Design tokens ported from apps/web/tailwind.config.ts + globals.css — the
// same shadcn-style semantic names, so class strings read identically across
// platforms. Values are resolved from the CSS variables in global.css.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui-mobile/src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // NativeWind's rem is 14, so the stock `11` (2.75rem) was 38.5pt — the
      // app-wide `h-11`/`min-h-11`/`w-11` touch-target convention measured
      // 39×38 on iOS (audit F-M-X-5-2). Pin it to the 44pt it is meant to be.
      spacing: { 11: '44px' },
      // Mobile type ramp, one step up from Tailwind's web defaults (dogfood
      // #10: "controls and text too small on the phone"). Anchored to Apple's
      // HIG sizes — body 17, callout 15, footnote 13 — so every text-* class
      // across the app scales together; web keeps its own defaults.
      fontSize: {
        xs: ['13px', { lineHeight: '18px' }],
        sm: ['15px', { lineHeight: '21px' }],
        base: ['17px', { lineHeight: '24px' }],
        lg: ['19px', { lineHeight: '26px' }],
        xl: ['21px', { lineHeight: '28px' }],
        '2xl': ['25px', { lineHeight: '31px' }],
        '3xl': ['31px', { lineHeight: '37px' }],
      },
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
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
};
