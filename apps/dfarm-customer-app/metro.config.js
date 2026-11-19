const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo root and app root configuration
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Add .onnx asset extension for YuNet and SFace models
config.resolver.assetExts.push('onnx');

// 3. Intercept Node builtins, onnxruntime, and web asset registry to prevent Metro bundler crashes
const ortShimPath = path.resolve(projectRoot, 'src/face-ai/ort-shim.ts');
const emptyShimPath = path.resolve(projectRoot, 'src/face-ai/empty-shim.ts');
const assetRegistryShimPath = path.resolve(projectRoot, 'src/face-ai/asset-registry-shim.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'onnxruntime-web' || moduleName === 'onnxruntime-node') {
    return {
      filePath: ortShimPath,
      type: 'sourceFile',
    };
  }
  if (
    moduleName === 'path' ||
    moduleName === 'node:path' ||
    moduleName === 'fs' ||
    moduleName === 'node:fs'
  ) {
    return {
      filePath: emptyShimPath,
      type: 'sourceFile',
    };
  }
  if (
    moduleName === '@react-native/assets-registry/registry' ||
    moduleName === '@react-native/assets-registry' ||
    moduleName === 'react-native-web/dist/exports/AssetRegistry'
  ) {
    return {
      filePath: assetRegistryShimPath,
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
