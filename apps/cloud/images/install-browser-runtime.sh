#!/bin/sh
set -eu

PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.59.1}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"

export PLAYWRIGHT_BROWSERS_PATH

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  fontconfig \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  libxshmfence1 \
  xdg-utils
rm -rf /var/lib/apt/lists/*

mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
npx -y "playwright@${PLAYWRIGHT_VERSION}" install --no-shell chromium
chromium_path="$(find "$PLAYWRIGHT_BROWSERS_PATH" -type f -name chrome -print -quit)"
test -n "$chromium_path"
ln -sf "$chromium_path" /usr/bin/chromium
chmod -R 755 "$PLAYWRIGHT_BROWSERS_PATH"
