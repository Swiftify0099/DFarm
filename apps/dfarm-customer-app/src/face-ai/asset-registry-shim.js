/**
 * Asset Registry Shim for React Native Web / Expo Metro Bundler.
 * Fixes "@react-native/assets-registry/registry" and "react-native-web/dist/exports/AssetRegistry"
 * resolution during web bundling with react-native-svg.
 */

const assets = [];

export function registerAsset(asset) {
  return assets.push(asset);
}

export function getAssetByID(assetId) {
  return assets[assetId - 1];
}

export const AssetRegistry = {
  registerAsset,
  getAssetByID,
};

export default {
  registerAsset,
  getAssetByID,
  AssetRegistry,
};
