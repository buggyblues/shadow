export function shellPage() {
  const assetVersion = process.env.SHADOW_APP_ASSET_VERSION ?? String(Date.now())
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flash</title>
    <link rel="stylesheet" href="/assets/app.css?v=${assetVersion}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js?v=${assetVersion}"></script>
  </body>
</html>`
}
