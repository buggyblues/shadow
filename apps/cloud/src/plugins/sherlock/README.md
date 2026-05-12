# Sherlock

Sherlock hunts for public social media accounts by username across hundreds of
sites.

## Runtime

- Installs Python 3 and pip in the plugin runtime asset init container.
- Creates a Python virtual environment under `/opt/shadow-plugin-deps/sherlock`.
- Installs the PyPI package `sherlock-project`.
- Exposes `sherlock` on `PATH` for enabled agents.

## Notes

Sherlock results are OSINT signals and should be verified before use. Avoid
using this plugin for harassment, doxxing, or broad scans of private
individuals.
