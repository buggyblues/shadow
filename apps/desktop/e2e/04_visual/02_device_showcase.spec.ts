import fs from 'node:fs'
import path from 'node:path'
import { test } from '@playwright/test'

const repoRoot = path.resolve(__dirname, '../../../..')
const screenshotDir = path.join(repoRoot, 'docs/e2e/screenshots')
const outputDir = path.join(repoRoot, 'docs/readme/showcase')

const items = [
  { src: '04-team-general-channel.png', out: 'channel.png', title: 'Shadow' },
  { src: '05-owner-dm-thread.png', out: 'dm.png', title: 'Shadow' },
  { src: '07-discover-communities.png', out: 'discover.png', title: 'Shadow' },
  { src: '08-buddy-marketplace.png', out: 'marketplace.png', title: 'Shadow' },
  { src: '10-shop-storefront.png', out: 'shop.png', title: 'Shadow' },
  { src: '09-workspace.png', out: 'workspace.png', title: 'Shadow' },
]

function deviceFrameHtml(imgBase64: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(180deg, #f5f7fa 0%, #e8ecf1 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 56px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
  }
  .window {
    border-radius: 10px;
    overflow: hidden;
    box-shadow:
      0 22px 70px 4px rgba(0, 0, 0, 0.12),
      0 0 0 0.5px rgba(0, 0, 0, 0.06);
    background: #fff;
    max-width: 1280px;
    width: 100%;
  }
  .titlebar {
    height: 38px;
    background: linear-gradient(180deg, #ececec 0%, #d8d8d8 100%);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    position: relative;
  }
  .traffic {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 0.5px solid rgba(0, 0, 0, 0.12);
  }
  .btn-close { background: #ff5f57; }
  .btn-minimize { background: #febc2e; }
  .btn-maximize { background: #28c840; }
  .titlebar-text {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 13px;
    color: #4d4d4d;
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .content img {
    width: 100%;
    display: block;
  }
</style>
</head>
<body>
<div class="window">
  <div class="titlebar">
    <div class="traffic">
      <span class="btn btn-close"></span>
      <span class="btn btn-minimize"></span>
      <span class="btn btn-maximize"></span>
    </div>
    <span class="titlebar-text">${title}</span>
  </div>
  <div class="content">
    <img src="data:image/png;base64,${imgBase64}" />
  </div>
</div>
</body>
</html>`
}

test.describe('device showcase frames', () => {
  test.beforeAll(() => {
    fs.mkdirSync(outputDir, { recursive: true })
  })

  for (const item of items) {
    test(`generate ${item.out}`, async ({ page }, testInfo) => {
      const inputPath = path.join(screenshotDir, item.src)
      if (!fs.existsSync(inputPath)) {
        testInfo.annotations.push({ type: 'skip', description: 'source screenshot missing' })
        return
      }

      const imgBase64 = fs.readFileSync(inputPath).toString('base64')
      await page.setViewportSize({ width: 1420, height: 900 })
      await page.setContent(deviceFrameHtml(imgBase64, item.title))
      await page.waitForTimeout(500)

      await page.screenshot({
        path: path.join(outputDir, item.out),
        fullPage: true,
      })
    })
  }
})
