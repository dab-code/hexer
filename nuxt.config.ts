// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  ssr: false,

  // Static-site output for GitHub Pages. A custom domain serves from the
  // root, so no baseURL override is needed; the github_pages preset emits
  // .nojekyll and a 404.html SPA fallback.
  nitro: {
    preset: 'github_pages'
  },

  modules: [
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/scripts'
  ],

  css: ['~/assets/css/main.css']
})
