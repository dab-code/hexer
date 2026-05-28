<template>
  <div>
    <UHeader :toggle="false">
        <template #title>
            HEXER
        </template>
        <template #right>
          <div class="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-4">
            <AuthMenu />
            <UColorModeButton variant="ghost" />
          </div>
        </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
