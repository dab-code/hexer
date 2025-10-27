<script setup lang="ts">
const { client, sessionUser } = useSupaUser()


const sign = ref<'in' | 'up'>('in')

watchEffect(() => {
  if (sessionUser.value) {
    return navigateTo('/')
  }
})

const fields = [{
  name: 'email',
  type: 'text' as const,
  label: 'Email',
  placeholder: 'Enter your email',
  required: true,
}, {
  name: 'password',
  label: 'Password',
  type: 'password' as const,
  placeholder: 'Enter your password',
}]

const providers = [{
  label: 'Google',
  icon: 'i-simple-icons-google',
  onClick: async () => {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://qqublgvcuagyvwkcryye.supabase.co/',
      },
    })
    if (error) displayError(error)
  },
}]

const signIn = async (email: string, password: string) => {
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (error) displayError(error)
}

const signUp = async (email: string, password: string) => {
  const { error } = await client.auth.signUp({
    email,
    password,
  })
  if (error) displayError(error)
  else {
    console.log('success')
    await signIn(email, password)
  }
}

async function onSubmit(payload: any) {
  const email = payload.data.email
  const password = payload.data.password

  if (sign.value === 'in') await signIn(email, password)
  else await signUp(email, password)
}


const displayError = (error: any) => {
  console.error(error)
}
</script>
<template>
  <UContainer class="h-[calc(100vh-var(--ui-header-height))] flex items-center justify-center px-4">
    <UPageCard class="max-w-sm w-full">
      <UAuthForm
        :title="sign === 'in' ? 'Login' : 'Sign up'"
        icon="i-lucide-user"
        :fields="fields"
        :providers="providers"
        @submit="onSubmit"
      >
        <template
          #description
        >
          {{ sign === 'up' ? 'Already have an account?' : 'Don\'t have an account?' }}
          <UButton
            variant="link"
            class="p-0"
            @click="sign = sign === 'up' ? 'in' : 'up'"
          >
            {{ sign === 'in' ? 'Sign up' : 'Sign in' }}
          </UButton>.
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
