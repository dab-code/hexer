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

  app: {
    head: {
      title: 'Hexer',
      titleTemplate: (t) => (t && t !== 'Hexer' ? `${t} · Hexer` : 'Hexer'),
    },
  },

  modules: [
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/scripts',
    '@nuxtjs/supabase'
  ],

  runtimeConfig: {
    public: {
      // Public Supabase Storage bucket holding hex/POI artwork. Override with
      // NUXT_PUBLIC_ASSET_BASE_URL to point at a staging bucket.
      assetBaseUrl: 'https://qtknfcplbxgtmrzxocfu.supabase.co/storage/v1/object/public/assets',
    },
  },

  // Auth + per-user encrypted map sync. The publishable key is safe to ship
  // in the static bundle: RLS in Postgres is what actually protects data.
  // Both values can be overridden at build/runtime via NUXT_PUBLIC_SUPABASE_URL
  // and NUXT_PUBLIC_SUPABASE_KEY.
  supabase: {
    url: 'https://qtknfcplbxgtmrzxocfu.supabase.co',
    key: 'sb_publishable_5TmfO4QPZ6AkqLBwqR9uwg_TW3Bz-SP',
    // Maps pages must stay anonymous-usable; the module's default behavior
    // is to redirect every non-excluded route to /login. We disable that and
    // gate only specific pages (e.g. /account) with a route-level middleware.
    redirect: false,
    // ssr: false → the SSR-cookie storage adapter is the wrong fit. It writes
    // cookies that the in-browser supabase-js client doesn't reliably restore
    // on page reload in dev (the session vanishes even though the cookie is
    // intact). Switching to localStorage-backed persistSession via the JS SDK
    // is reliable, and we're not doing any SSR anyway.
    useSsrCookies: false,
  },

  css: ['~/assets/css/main.css']
})
