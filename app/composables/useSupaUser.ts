import { createSharedComposable } from "@vueuse/core"
import type { Session } from '@supabase/supabase-js'

const useSupaUser = createSharedComposable(() => {
  const supabaseClient = useSupabaseClient()
  const supaBaseSessionUser = useSupabaseSession()

  const supabaseUser = () => {
    return useSupabaseUser()
  }

  // Computed properties for common checks
  const isAuthenticated = computed(() => !!supaBaseSessionUser.value?.user)
  const userId = computed(() => supaBaseSessionUser.value?.user?.sub ?? supaBaseSessionUser.value?.user?.id)
  const userEmail = computed(() => supaBaseSessionUser.value?.user?.email)
  const userName = computed(() => supaBaseSessionUser.value?.user?.user_metadata?.name)

  // Auth methods
  const logout = async () => {
    await supabaseClient.auth.signOut()
    navigateTo('/login')
  }

  const refreshSession = async () => {
    const { data, error } = await supabaseClient.auth.refreshSession()
    if (error) {
      console.error('Failed to refresh session:', error)
      throw error
    }
    return data
  }

  // Wait for user to be loaded (useful in components)
  const waitForUser = () => {
    return new Promise<Omit<Session, "user"> | null>((resolve) => {
      if (supaBaseSessionUser.value) {
        resolve(supaBaseSessionUser.value)
      } else {
        const unwatch = watch(supaBaseSessionUser, (newUser) => {
          if (newUser !== null) {
            unwatch()
            resolve(newUser)
          }
        })
      }
    })
  }

  return {
    sessionUser: supaBaseSessionUser,
    user: supabaseUser,
    client: supabaseClient,
    isAuthenticated,
    userId,
    userEmail,
    userName,
    logout,
    refreshSession,
    waitForUser
  }
})

export default useSupaUser