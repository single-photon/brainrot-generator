import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

export default {
  plugins: [
    tailwindcss(), // Note the function call here: tailwindcss()
    autoprefixer,
  ],
}