// Route guard: redirects anonymous visitors to /login with a next= param
// so they can land back on the gated page after signing in. Apply per-page
// via `definePageMeta({ middleware: 'auth' })`. The global supabase config
// has `redirect: false`, so nothing else gates routes by default — this
// middleware is the only opt-in protection.

export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }
})
