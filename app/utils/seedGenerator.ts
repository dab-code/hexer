import { randomRoll } from './terrainGenerator'

const listA = [
  'aether',
  'arcane',
  'astral',
  'umbra',
  'fey',
  'wyrd',
  'nether',
  'cipher',
  'sol',
  'lun',
  'ember',
  'verdant',
  'sepulcher',
  'obsidian',
  'sable',
  'chroma',
  'epoch',
  'heliacal',
  'noctis',
  'oracle',
  'wyvern',
  'sorrow',
  'myrrh',
  'quasar',
  'void'
]

const listB = [
  'veil',
  'shard',
  'weave',
  'mote',
  'spire',
  'cairn',
  'holt',
  'mere',
  'tor',
  'bane',
  'morn',
  'quill',
  'dirge',
  'vow',
  'echo',
  'sigil',
  'wight',
  'pyre',
  'gnosis',
  'loch',
  'sanctum',
  'relic',
  'grave',
  'light',
  'nyx'
]

export const generateSeed = () => {
    return `${listA[randomRoll(listA.length)]}-${listB[randomRoll(listB.length)]}`
}
