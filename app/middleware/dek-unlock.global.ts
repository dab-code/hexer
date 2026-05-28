// Global guard for the "session outlived the encryption key" case.
//
// The Supabase session persists in localStorage (survives a browser restart),
// but the DEK lives in sessionStorage and is wiped when the tab/browser
// closes. So a returning user — or one opening the app on a device that
// already remembered their session — can be authenticated (useSupabaseUser is
// populated) while holding no key to decrypt their cloud maps. Left alone,
// refreshCloud() silently bails and the user just sees an empty "No worlds
// yet" with no error and no network request.
//
// When we detect a session but no DEK, send the user to /login to re-enter
// their password, which re-derives the DEK. A fresh form login sets the DEK
// before navigating to any guarded route, so this never fires immediately
// after logging in — only on a later reopen / cross-device visit.

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const user = useSupabaseUser()
  if (!user.value) return // anonymous: local maps only, no key needed

  const { dek, restoreFromSession } = useEncryptionKey()
  if (dek.value) return // already unlocked

  // The app-boot DEK restore is fire-and-forget; await it here so we don't
  // redirect during the brief window before sessionStorage has been read.
  await restoreFromSession()
  if (dek.value) return

  if (to.path === '/login') return // already heading there; avoid a loop

  return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
})
