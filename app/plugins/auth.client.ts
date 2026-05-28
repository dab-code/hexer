// Wires the Supabase auth-state listener to our session encryption key.
//
// Runs once on app startup (client-only because sessionStorage exists only
// in the browser). On startup we kick off a rehydrate of the DEK from
// sessionStorage so same-tab reloads keep cloud maps accessible without
// re-prompting for the password. On SIGNED_OUT we drop the cached DEK.
//
// The plugin must NOT await during init: an awaited plugin breaks the
// NuxtApp context for plugins loaded after it (e.g. @nuxt/ui's color plugin
// calling useHead). We fire-and-forget the restore; consumers can `await
// useEncryptionKey().restoreFromSession()` themselves if they need to gate
// on the result.

export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient()
  const { restoreFromSession, clear } = useEncryptionKey()

  // Best-effort; failures (e.g. corrupted cache) silently drop the entry.
  void restoreFromSession()

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') clear()
  })
})
