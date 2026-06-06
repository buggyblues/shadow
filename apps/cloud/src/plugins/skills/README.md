# Skills Plugin

The Skills plugin installs the `skills` CLI and mounts agent-declared skills into selected Buddy runtimes.

## Scope

- Configure this plugin on `deployments.agents[].use`.
- Do not configure this plugin at the top-level `use`.
- The plugin does not install any community skill by default.
- Templates or agents must declare every required skill explicitly.

## Configuration

```json
{
  "plugin": "skills",
  "options": {
    "install": [
      {
        "package": "owner/repository",
        "skills": ["skill-folder"]
      },
      {
        "url": "https://github.com/owner/repository.git",
        "ref": "main",
        "from": "skills",
        "include": ["another-skill-folder"]
      }
    ]
  }
}
```

`package` accepts `owner/repository`, a GitHub URL, or `owner/repository@skill-folder`. `skills` and `include` both map to folders under the source `from` directory, which defaults to `skills`.

## Runtime

- Installs the `skills` npm CLI into the agent runtime.
- Mounts configured skills under `/workspace/.agents/plugin-skills/skills`.
- Adds that mount path to the agent skill loader only when at least one skill source is configured.

## References

- [Agent Skills directory](https://skills.sh)
- [Vercel Labs skills repository](https://github.com/vercel-labs/skills)
