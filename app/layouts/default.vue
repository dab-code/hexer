<template>
  <div>
    <UHeader :toggle="false">
        <template #title>
            HEXER
        </template>
        <template #right>
          <AuthMenu />
          <UColorModeButton variant="ghost" />
        </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
