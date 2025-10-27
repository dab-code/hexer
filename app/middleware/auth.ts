export default defineNuxtRouteMiddleware((to) => {
  const { sessionUser } = useSupaUser()

  if (!sessionUser.value) {
    return navigateTo('/login')
  }
})