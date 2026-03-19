const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the monorepo root for changes in shared packages
// Keep Expo's default watchFolders and add monorepo root
const defaultWatchFolders = config.watchFolders || []
config.watchFolders = [...defaultWatchFolders, monorepoRoot]

// Resolve modules from both the project and monorepo root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Force singleton packages to resolve from mobile's node_modules
// to prevent duplicate React (web uses 19.2.4, mobile needs 19.1.0)
const projectModules = path.resolve(projectRoot, 'node_modules')
const singletonPackages = ['react', 'react-native', 'react/jsx-runtime', 'react/jsx-dev-runtime']

// Store the original resolveRequest if it exists
const originalResolveRequest = config.resolver.resolveRequest

// Create a custom resolveRequest that forces singleton packages to resolve from mobile's node_modules
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Check if this is a singleton package we need to handle
  const isSingletonPackage = singletonPackages.some(
    (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`),
  )

  if (isSingletonPackage) {
    // Create a modified context that forces resolution from mobile's node_modules
    const modifiedContext = {
      ...context,
      originModulePath: path.join(projectModules, '_virtual.js'),
    }
    return context.resolveRequest(modifiedContext, moduleName, platform)
  }

  // For non-singleton packages, use the original resolveRequest or default behavior
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }

  // Fall back to the default resolveRequest
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
