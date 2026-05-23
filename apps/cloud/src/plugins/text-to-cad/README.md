# CAD Skills

Mounts the `earthtojake/text-to-cad` agent skills for CAD, robotics, and
hardware design workflows.

## Runtime

- Pulls the repository `skills/` tree into
  `/workspace/.agents/plugin-skills/text-to-cad`.
- Installs Python CAD dependencies into the plugin runtime dependency volume
  from a Debian-based Node init image so binary Python wheels are available.
- Installs the CAD Explorer viewer dependencies after the skills have been
  copied into the init-container staging volume.
- Patches the bundled step.parts downloader to use the currently live
  `https://www.step.parts/v1` API origin.
- Exposes `cad-step`, `cad-inspect`, and `cad-dxf` wrappers on `PATH`.

## Notes

The upstream repository excludes LFS-heavy benchmark assets from normal use.
This plugin mounts only the skill tree and keeps CAD outputs in the active
workspace as ordinary derived artifacts.
