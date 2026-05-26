export function shellPage() {
  const viteDevServerUrl = process.env.QUIZ_VITE_DEV_SERVER_URL?.replace(/\/+$/, '')
  const devEntryVersion = encodeURIComponent(
    process.env.QUIZ_VITE_DEV_CACHE_KEY ?? String(Date.now()),
  )
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
    : `<link rel="stylesheet" href="/assets/app.css" />
    <script type="module" src="/assets/app.js"></script>`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quiz</title>
  </head>
  <body>
    <div id="root"></div>
    ${assets}
  </body>
</html>`
}
