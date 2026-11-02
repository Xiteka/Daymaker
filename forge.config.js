const path = require('node:path');

module.exports = {
  packagerConfig: {
    name: 'Daymark',
    executableName: 'Daymark',
    appBundleId: 'com.daymark.tracker',
    appCategoryType: 'public.app-category.finance',
    asar: true,
    // Ad-hoc signing makes the local Apple Silicon build valid without a
    // Developer ID certificate. Public distribution needs Developer ID signing
    // and notarization in place of this local-build configuration.
    osxSign: {
      identity: '-',
      identityValidation: false,
      gatekeeperAssess: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      // Ad-hoc signatures have no Apple Team ID for hardened library validation.
      optionsForFile: () => ({ hardenedRuntime: false })
    },
    download: {
      cacheRoot: process.env.electron_config_cache || path.join(__dirname, '.cache/electron')
    },
    ignore: [/^\/tests(?:\/|$)/, /^\/build(?:\/|$)/, /^\/\.cache(?:\/|$)/, /^\/preview\.cjs$/, /^\/README\.md$/]
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] }
  ]
};
