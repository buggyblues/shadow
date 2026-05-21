# AgentMemory

AgentMemory adds persistent, searchable memory to Shadow Cloud agents through
the `@agentmemory/mcp` MCP server and the `agentmemory` CLI.

## Capabilities

- Registers the AgentMemory MCP server for every supported runtime.
- Installs the AgentMemory CLI and MCP package into the runtime dependency
  volume.
- Supports an optional remote AgentMemory service via `AGENTMEMORY_URL` and
  `AGENTMEMORY_API_KEY`.

## Configuration

```json
{
  "use": [
    {
      "plugin": "agentmemory",
      "options": {}
    }
  ]
}
```

Optional environment fields:

- `AGENTMEMORY_URL`: remote service URL. Omit to use the local runtime store.
- `AGENTMEMORY_API_KEY`: key for a protected remote service.
- `AGENTMEMORY_PROJECT_ID`: project/workspace partition id.

## Safety

Agents should only store durable project context, decisions, and user-approved
facts. Do not store secrets, tokens, credentials, or private personal data.
