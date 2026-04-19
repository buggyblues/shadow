# TOOLS.md — Local Tool Notes

## Built-in Tools

### pdf
Analyze PDF documents — extract text, tables, charts, and structured data.

### image
Analyze image content — describe visuals, extract text (OCR), identify charts and diagrams.

### read / write
Read material files and write output files. Output should go to `/output/` directory.

### exec
Execute CLI commands in the container environment.

### sessions_spawn
Spawn sub-agents for parallel material analysis. Use for complex or multi-file tasks.

## Notes

- The `pdf` tool handles PDF analysis natively.
- The `image` tool handles image analysis natively.
- Skills provide specialized knowledge extraction and analysis capabilities.
- Sub-agents DO NOT have access to all tools — coordinate through the main agent for complex operations.
