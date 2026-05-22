<template>
  <div>
    <UHeader :toggle="false">
        <template #title>
            HEXER
        </template>
        <template #right>
          <UColorModeButton variant="ghost" />
        </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
