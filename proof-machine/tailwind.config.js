/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          500: '#FF6B2C',
          600: '#e55a1f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
