import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          foreground: '#ffffff'
        }
      },
      boxShadow: {
        card: '0 18px 45px -15px rgba(15, 23, 42, 0.25)'
      }
    }
  },
  plugins: []
};

export default config;
