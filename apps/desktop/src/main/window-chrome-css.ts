export const DESKTOP_COMMUNITY_WINDOW_CONTROL_INSET = 32

export function createDesktopCommunityWindowChromeCss(platform: NodeJS.Platform): string {
  if (platform !== 'darwin') return ''

  return `
html.desktop-darwin.desktop-community-window.desktop-window-windowed
  .desktop-app-shell.os-app-shell {
  --desktop-community-window-control-inset: ${DESKTOP_COMMUNITY_WINDOW_CONTROL_INSET}px;
  padding-top: 0 !important;
}

html.desktop-darwin.desktop-community-window.desktop-window-windowed
  .desktop-app-shell.os-app-shell
  .desktop-window-drag-strip {
  display: block !important;
  height: var(--desktop-community-window-control-inset) !important;
}

html.desktop-darwin.desktop-community-window.desktop-window-windowed
  .desktop-app-shell.os-app-shell
  :is(
    .desktop-os-top-bar,
    header.absolute.left-0.right-0.top-0
  ) {
  top: 0 !important;
  box-sizing: border-box;
  height: calc(2.5rem + var(--desktop-community-window-control-inset)) !important;
  padding-top: var(--desktop-community-window-control-inset) !important;
}

html.desktop-darwin.desktop-community-window.desktop-window-windowed
  .desktop-app-shell.os-app-shell
  :is(
    .desktop-os-main-surface,
    main.absolute.inset-0
  ) {
  top: var(--desktop-community-window-control-inset) !important;
}

html.desktop-darwin.desktop-community-window.desktop-window-fullscreen
  .desktop-app-shell.os-app-shell,
html.desktop-darwin.desktop-community-window:fullscreen
  .desktop-app-shell.os-app-shell {
  padding-top: 0 !important;
  background-color: transparent;
}

html.desktop-darwin.desktop-community-window.desktop-window-fullscreen
  .desktop-app-shell.os-app-shell
  :is(
    .desktop-os-top-bar,
    header.absolute.left-0.right-0.top-0
  ),
html.desktop-darwin.desktop-community-window:fullscreen
  .desktop-app-shell.os-app-shell
  :is(
    .desktop-os-top-bar,
    header.absolute.left-0.right-0.top-0
  ) {
  top: 0 !important;
  height: 2.5rem !important;
  padding-top: 0 !important;
}

html.desktop-darwin.desktop-community-window.desktop-window-fullscreen
  .desktop-app-shell.os-app-shell
  :is(
    .desktop-os-main-surface,
    main.absolute.inset-0
  ),
html.desktop-darwin.desktop-community-window:fullscreen
  .desktop-app-shell.os-app-shell
  :is(
    .desktop-os-main-surface,
    main.absolute.inset-0
  ) {
  top: 0 !important;
}

html.desktop-darwin.desktop-community-window.desktop-window-fullscreen
  .desktop-app-shell.os-app-shell
  .desktop-window-drag-strip,
html.desktop-darwin.desktop-community-window:fullscreen
  .desktop-app-shell.os-app-shell
  .desktop-window-drag-strip {
  display: none !important;
}
`
}
