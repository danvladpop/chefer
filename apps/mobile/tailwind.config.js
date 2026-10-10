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
      // across the app scales together; web keeps its own defaults. WP-04: xs/sm
      // raised again (13/15 -> 14/16) — the 12–13px secondary text was the
      // "trainer couldn't read it without glasses" complaint (2026-10-02).
      fontSize: {
        xs: ['14px', { lineHeight: '19px' }],
        sm: ['16px', { lineHeight: '22px' }],
        base: ['17px', { lineHeight: '24px' }],
        lg: ['19px', { lineHeight: '26px' }],
        xl: ['21px', { lineHeight: '28px' }],
        '2xl': ['25px', { lineHeight: '31px' }],
        '3xl': ['31px', { lineHeight: '37px' }],
        // Revamp text styles (docs/mobile-ux-revamp/plan.md, "Type"): named
        // for their role, sized like Apple's text styles but never below the
        // 14px floor WP-04 set. Weights come from the component, not here.
        display: ['34px', { lineHeight: '41px' }],
        title1: ['28px', { lineHeight: '34px' }],
        title2: ['22px', { lineHeight: '28px' }],
        title3: ['20px', { lineHeight: '25px' }],
        headline: ['17px', { lineHeight: '22px' }],
        body: ['17px', { lineHeight: '24px' }],
        callout: ['16px', { lineHeight: '21px' }],
        subhead: ['15px', { lineHeight: '20px' }],
        caption: ['14px', { lineHeight: '19px' }],
      },
      colors: {
        // Revamp colour roles (@chefer/tokens color.ts → global.css). The
        // shadcn names below stay for the screens the revamp hasn't reached.
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        separator: 'rgb(var(--separator) / <alpha-value>)',
        label: {
          DEFAULT: 'rgb(var(--label) / <alpha-value>)',
          secondary: 'rgb(var(--label-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--label-tertiary) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          on: 'rgb(var(--on-brand) / <alpha-value>)',
          tint: 'rgb(var(--brand-tint) / <alpha-value>)',
        },
        positive: 'rgb(var(--positive) / <alpha-value>)',
        attention: 'rgb(var(--attention) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
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
        // Role radii from @chefer/tokens radius.ts (web has the same classes).
        inner: '8px',
        control: '12px',
        card: '16px',
        sheet: '24px',
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
};
