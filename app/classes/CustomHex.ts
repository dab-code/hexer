import { defineHex, Orientation } from 'honeycomb-grid'

// Orientation is fixed at class-creation time by honeycomb-grid, so the hex
// class is built per-orientation by this factory.
export function createCustomHex(orientation: Orientation) {
  return class CustomHex extends defineHex({ dimensions: 30, orientation }) {}
}

export type CustomHex = InstanceType<ReturnType<typeof createCustomHex>>