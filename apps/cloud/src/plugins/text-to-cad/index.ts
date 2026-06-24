import {
  attachConnectorRuntimeAssets,
  connectorManifest,
  installedCheck,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'
import type { PluginRuntimeDependency } from '../types.js'

const PLUGIN_ID = 'text-to-cad'
const SKILLS_MOUNT = `/workspace/.agents/plugin-skills/${PLUGIN_ID}`
const RUNTIME_MOUNT = `/opt/shadow-plugin-deps/${PLUGIN_ID}`
const PYTHON_DEPS_PATH = `${RUNTIME_MOUNT}/python`

const manifest = connectorManifest({
  id: 'text-to-cad',
  name: 'CAD Skills',
  description:
    'CAD Skills mounts text-to-cad workflows for STEP-first CAD generation, inspection, rendering, robot descriptions, standard parts, and fabrication preflight.',
  category: 'automation',
  icon: 'boxes',
  website: 'https://www.cadskills.xyz',
  docs: 'https://github.com/earthtojake/text-to-cad',
  fields: [],
  authType: 'none',
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['cad', 'step', 'stl', 'dxf', 'robotics', 'urdf', 'sdf', 'srdf', 'hardware'],
  popularity: 88,
})

const runtimeDependencies: PluginRuntimeDependency[] = [
  {
    id: 'text-to-cad-python-prereqs',
    kind: 'system-package',
    packages: ['python3', 'py3-pip', 'libgl1', 'libglib2.0-0', 'libxrender1', 'libxext6', 'libsm6'],
    description: 'Python, pip, and shared libraries for CAD skill helper scripts',
  },
  {
    id: 'text-to-cad-python-packages',
    kind: 'shell',
    command: [
      "python3 -m pip install --no-cache-dir --target /runtime-deps/python 'build123d' 'ezdxf' 'numpy' 'trimesh' 'vtk' 'py-lib3mf'",
    ],
    description: 'Python CAD dependencies used by text-to-cad scripts',
  },
  {
    id: 'text-to-cad-python-compat',
    kind: 'shell',
    command: [
      [
        "printf 'from lib3mf import Lib3MF\\n' > /runtime-deps/python/py_lib3mf.py",
        "cat > /runtime-deps/python/sitecustomize.py <<'SHADOWOB_TEXT_TO_CAD_SITE_CUSTOMIZE'",
        'try:',
        '    import build123d.exporters3d as _build123d_exporters3d',
        '    from OCP.APIHeaderSection import APIHeaderSection_MakeHeader',
        '    from OCP.TCollection import TCollection_HAsciiString',
        '    _build123d_exporters3d.APIHeaderSection_MakeHeader = APIHeaderSection_MakeHeader',
        '    _build123d_exporters3d.TCollection_HAsciiString = TCollection_HAsciiString',
        'except Exception:',
        '    pass',
        'SHADOWOB_TEXT_TO_CAD_SITE_CUSTOMIZE',
      ].join('\n'),
    ],
    description: 'Compatibility shims for build123d 3MF and STEP exporter imports',
  },
  {
    id: 'text-to-cad-viewer-deps',
    kind: 'shell',
    phase: 'post-source',
    command: [
      'if [ -f /plugin-skills/render/scripts/viewer/package-lock.json ]; then npm --prefix /plugin-skills/render/scripts/viewer ci; fi',
    ],
    description: 'Node dependencies for the CAD Explorer viewer bundled with the render skill',
  },
  {
    id: 'text-to-cad-skill-compat',
    kind: 'shell',
    phase: 'post-source',
    command: [
      [
        "python3 - <<'SHADOWOB_TEXT_TO_CAD_PATCH_SKILLS'",
        'from pathlib import Path',
        "path = Path('/plugin-skills/step-parts/scripts/download_step_part.py')",
        'if path.exists():',
        "    text = path.read_text(encoding='utf-8')",
        '    text = text.replace(\'DEFAULT_ORIGIN = "https://api.step.parts"\', \'DEFAULT_ORIGIN = "https://www.step.parts"\')',
        "    path.write_text(text, encoding='utf-8')",
        'SHADOWOB_TEXT_TO_CAD_PATCH_SKILLS',
      ].join('\n'),
    ],
    description: 'Compatibility patch for the live step.parts API origin',
  },
  {
    id: 'text-to-cad-cli-shims',
    kind: 'shell',
    phase: 'post-source',
    command: [
      [
        'mkdir -p /runtime-deps/bin',
        "cat > /runtime-deps/bin/cad-step <<'SHADOWOB_CAD_STEP'",
        '#!/bin/sh',
        `export PYTHONPATH="${PYTHON_DEPS_PATH}\${PYTHONPATH:+:\${PYTHONPATH}}"`,
        `exec python3 ${SKILLS_MOUNT}/cad/scripts/step "$@"`,
        'SHADOWOB_CAD_STEP',
        "cat > /runtime-deps/bin/cad-inspect <<'SHADOWOB_CAD_INSPECT'",
        '#!/bin/sh',
        `export PYTHONPATH="${PYTHON_DEPS_PATH}\${PYTHONPATH:+:\${PYTHONPATH}}"`,
        `exec python3 ${SKILLS_MOUNT}/cad/scripts/inspect "$@"`,
        'SHADOWOB_CAD_INSPECT',
        "cat > /runtime-deps/bin/cad-dxf <<'SHADOWOB_CAD_DXF'",
        '#!/bin/sh',
        `export PYTHONPATH="${PYTHON_DEPS_PATH}\${PYTHONPATH:+:\${PYTHONPATH}}"`,
        `exec python3 ${SKILLS_MOUNT}/cad/scripts/dxf "$@"`,
        'SHADOWOB_CAD_DXF',
        'chmod +x /runtime-deps/bin/cad-step /runtime-deps/bin/cad-inspect /runtime-deps/bin/cad-dxf',
      ].join('\n'),
    ],
    description: 'Convenience wrappers for core CAD command-line helpers',
  },
]

const skillSources = [
  {
    id: 'text-to-cad-skills',
    kind: 'git' as const,
    url: 'https://github.com/earthtojake/text-to-cad.git',
    ref: 'main',
    from: 'skills',
    targetPath: SKILLS_MOUNT,
    description: 'CAD, render, robot-description, step.parts, and fabrication agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'cad-step',
      command: 'cad-step',
      description: 'Generate STEP/STP artifacts and CAD sidecars from build123d Python sources',
    },
    {
      name: 'cad-inspect',
      command: 'cad-inspect',
      description: 'Inspect STEP/STP geometry, measurements, references, and topology facts',
    },
    {
      name: 'cad-dxf',
      command: 'cad-dxf',
      description: 'Create and validate secondary DXF fabrication exports',
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('cad-step-cli-installed', 'CAD step helper installed', ['cad-step', '--help']),
    {
      id: 'text-to-cad-skills-mounted',
      label: 'text-to-cad skills mounted',
      kind: 'command',
      command: ['test', '-f', `${SKILLS_MOUNT}/cad/SKILL.md`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
    {
      id: 'cad-python-deps-importable',
      label: 'CAD Python dependencies importable',
      kind: 'command',
      command: ['python3', '-c', 'import build123d, ezdxf, numpy, trimesh'],
      timeoutMs: 20_000,
      risk: 'safe',
    },
    {
      id: 'cad-viewer-deps-installed',
      label: 'CAD Explorer viewer dependencies installed',
      kind: 'command',
      command: ['test', '-d', `${SKILLS_MOUNT}/render/scripts/viewer/node_modules`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  env: () => ({
    PYTHONPATH: PYTHON_DEPS_PATH,
  }),
  prompt:
    'Use CAD Skills for STEP-first CAD generation, build123d source edits, geometry inspection, robot descriptions, CAD Explorer rendering, standard STEP parts, and fabrication preflight. Treat generated CAD exports as derived artifacts and validate geometry before returning results.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  runtimeImage: 'node:22-bookworm-slim',
  skillsMountPath: SKILLS_MOUNT,
})
