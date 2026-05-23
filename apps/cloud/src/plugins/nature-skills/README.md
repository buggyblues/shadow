# Nature Skills

Mounts `Yuan1z0825/nature-skills` into Cloud agents as a bundled academic
research and publication workflow plugin.

## Runtime

- Pulls all `skills/nature-*` folders into
  `/workspace/.agents/plugin-skills/nature-skills`.
- Installs the Python dependencies needed by the bundled academic-search MCP
  server into the plugin runtime dependency volume from a Debian-based Node init
  image.
- Registers the `nature-academic-search` stdio MCP server.

## Optional Credentials

- `PUBMED_EMAIL` improves compliance with NCBI E-utilities guidance.
- `NCBI_API_KEY` raises PubMed rate limits.
- `SEMANTIC_SCHOLAR_API_KEY` can improve Semantic Scholar search throughput.

The non-search skills can be used without credentials.
