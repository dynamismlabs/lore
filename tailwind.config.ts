import typographyPlugin from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Memory titles and writing: a warm serif, so it reads like a journal.
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'recording-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        shrink: {
          from: { transform: 'scaleX(1)' },
          to: { transform: 'scaleX(0)' },
        },
        // Story mode: photos drift slowly; alternate in/out so it doesn't feel mechanical.
        'ken-burns-in': {
          from: { transform: 'scale(1)' },
          to: { transform: 'scale(1.1) translate(-1.5%, -1%)' },
        },
        'ken-burns-out': {
          from: { transform: 'scale(1.1) translate(1.5%, 1%)' },
          to: { transform: 'scale(1)' },
        },
        // Long words scroll up while the voice plays (distance set via --story-scroll).
        'story-scroll': {
          to: { transform: 'translateY(var(--story-scroll))' },
        },
        'sound-bar': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'recording-pulse': 'recording-pulse 1.4s ease-in-out infinite',
        // Duration set inline (the vibe recording limit).
        shrink: 'shrink 1s linear forwards',
        // Durations are set inline per shot.
        'ken-burns-in': 'ken-burns-in 6s ease-out forwards',
        'ken-burns-out': 'ken-burns-out 6s ease-out forwards',
        'story-scroll': 'story-scroll 10s linear forwards',
        'sound-bar': 'sound-bar 1s ease-in-out infinite',
      },
    },
  },
  plugins: [typographyPlugin, animatePlugin],
} satisfies Config;
