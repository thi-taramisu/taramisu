import type { ItemAsset } from '../../api/models/asset'

/** First asset of the item whose name shares a word of four or more letters with `name` (wireframe: "Similar existing"). */
export function findSimilarAsset(name: string, assets: ItemAsset[]): ItemAsset | undefined {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
  if (words.length === 0) return undefined
  return assets.find((asset) => words.some((word) => asset.name.toLowerCase().includes(word)))
}
