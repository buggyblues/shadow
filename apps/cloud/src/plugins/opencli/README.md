# OpenCLI

OpenCLI turns websites, browser sessions, Electron apps, and local tools into
deterministic CLI commands that agents can call from the runtime container.

## Runtime

- Installs `@jackwener/opencli` globally into the plugin runtime dependency
  volume.
- Mounts the OpenCLI agent skills from `jackwener/opencli` into
  `/workspace/.agents/plugin-skills/opencli`.
- Exposes the `opencli` binary on `PATH` for enabled agents.

## Notes

Browser-backed OpenCLI commands require a Chrome or Chromium bridge profile.
Public adapters and CLI discovery commands can run without a browser bridge.
