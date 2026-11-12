import type { Asset, AssetRelations, PatchAssetBody } from '../models/asset'

/**
 * Assets with their cybersecurity properties and relations. Mocked until the asset (#84) and property
 * (#160) routes are wired up; calls reject with an `ApiError` like the item service. Links to damage
 * scenarios are changed through the damage scenario service.
 */
export interface AssetService {
  get(projectId: string, assetId: string): Promise<Asset>
  /** Rejects with 409 if a removed property still leads to a damage scenario. */
  update(projectId: string, assetId: string, body: PatchAssetBody): Promise<Asset>
  relations(projectId: string, assetId: string): Promise<AssetRelations>
}
