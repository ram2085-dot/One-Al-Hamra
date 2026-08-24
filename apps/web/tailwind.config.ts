import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1A1A1A',
        accent: { DEFAULT: '#9C3428', dark: '#7C2A20' },
        surface: '#F5F5F4',
        card: '#FFFFFF',
        line: '#E5E5E3',
      },
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
