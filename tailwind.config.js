/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts}"],
  theme: {
    extend: {
      fontFamily: {
        title: ["Baskerville", "Times New Roman", "serif"],
        body: ["Merriweather", "Palatino Linotype", "serif"]
      },
      colors: {
        boardLight: "#f7edd9",
        boardDark: "#a97852"
      }
    }
  },
  plugins: []
};
