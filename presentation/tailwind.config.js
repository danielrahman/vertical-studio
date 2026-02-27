/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        moss: '#1f4f46',
        sand: '#d6b88d',
        mist: '#eef3ef',
        shell: '#f7f6f2'
      },
      boxShadow: {
        card: '0 18px 40px -22px rgba(16, 46, 40, 0.35)'
      }
    }
  },
  plugins: []
};
