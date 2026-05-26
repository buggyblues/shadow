export function shellPage() {
  const viteDevServerUrl = process.env.FLASH_VITE_DEV_SERVER_URL?.replace(/\/+$/, '')
  const devEntryVersion = encodeURIComponent(
    process.env.FLASH_VITE_DEV_CACHE_KEY ?? String(Date.now()),
  )
  const assetVersion = process.env.SHADOW_APP_ASSET_VERSION ?? String(Date.now())
  const assets = viteDevServerUrl
    ? `<script type="module">
      import RefreshRuntime from '${viteDevServerUrl}/@react-refresh'
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
    </script>
    <script type="module" src="${viteDevServerUrl}/@vite/client"></script>
    <script type="module" src="${viteDevServerUrl}/src/client/main.tsx?t=${devEntryVersion}"></script>`
    : `<link rel="stylesheet" href="/assets/app.css?v=${assetVersion}" />
    <script type="module" src="/assets/app.js?v=${assetVersion}"></script>`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flash</title>
  </head>
  <body>
    <div id="root"></div>
    ${assets}
  </body>
</html>`
}
