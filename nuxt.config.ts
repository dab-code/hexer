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

  runtimeConfig: {
    public: {
      // Public Supabase Storage bucket holding hex/POI artwork. Override with
      // NUXT_PUBLIC_ASSET_BASE_URL to point at a staging bucket.
      assetBaseUrl: 'https://qtknfcplbxgtmrzxocfu.supabase.co/storage/v1/object/public/assets',
    },
  },

  css: ['~/assets/css/main.css']
})
