import { defineHex, Orientation } from 'honeycomb-grid'

export function createCustomHex(orientation: Orientation) {
  return class CustomHex extends defineHex({
    dimensions: 30,
    orientation: orientation
  }) {

    terrain: number = 0
    danger_level: number = 0
    we_notes: string = ''
    is_revealed: boolean = false

    // methods always exist in the prototype
    // customMethod() {}
  }
}

export type CustomHex = InstanceType<ReturnType<typeof createCustomHex>>