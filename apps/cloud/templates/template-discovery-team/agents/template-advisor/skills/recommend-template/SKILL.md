---
name: recommend-template
description: Evaluate a list of candidate templates against gathered user requirements and produce a ranked recommendation with honest trade-off analysis.
license: MIT
compatibility: ">=0.1.0"
allowed-tools: []
metadata:
  author: shadowob
  version: "1.0.0"
  category: discovery
---

# Instructions

## Purpose
Select the best 1–3 templates from Scout's results and present a reasoned recommendation to the user.

## Evaluation Criteria

Score each candidate against the user's requirements:
- **Goal alignment** (0–3): Does the template's description match the primary goal?
- **Integration coverage** (0–3): Does it include the required integrations?
- **Complexity fit** (0–2): Is the agent count appropriate for the user's scale?
- **Deployment match** (0–2): Does the template support the preferred deployment target?

## Output Format

Present the top recommendation first, then alternatives:

```
✅ Best Match: **{teamName}** (`{slug}`)
{description}

Why it fits:
- {reason 1}
- {reason 2}

⚠️ Gaps / trade-offs:
- {gap 1 — be honest}

Runner-up: **{teamName}** (`{slug}`) — {one-line reason}
```

Always end with: "Does this match what you had in mind? If yes, I'll hand off to the Deploy Mentor."

## Constraints
- Never recommend a template you haven't verified via the Scout
- Include the `slug` in your recommendation — the Deploy Mentor needs it
- Be honest about gaps; don't oversell
