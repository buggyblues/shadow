-- Seed official templates for Shadow Cloud SaaS platform
-- Uses ON CONFLICT DO NOTHING so re-running is safe

INSERT INTO "cloud_templates" (
  "id", "slug", "name", "description",
  "source", "review_status",
  "content", "tags", "category", "base_cost", "deploy_count"
)
VALUES
  (
    gen_random_uuid(),
    'discovery-team',
    'Discovery Team',
    'An AI team that explores topics in depth: a Lead Researcher coordinates a Search Specialist and a Synthesizer to produce comprehensive research reports.',
    'official', 'approved',
    '{"agents":[{"role":"lead-researcher","model":"gpt-4o","description":"Coordinates the research workflow"},{"role":"search-specialist","model":"gpt-4o-mini","description":"Searches and retrieves relevant information"},{"role":"synthesizer","model":"gpt-4o","description":"Synthesizes findings into coherent reports"}],"workflow":"research","version":1}',
    '["research","discovery","multi-agent"]',
    'research',
    0,
    0
  ),
  (
    gen_random_uuid(),
    'code-review-team',
    'Code Review Team',
    'Automated code review pipeline with a Senior Reviewer, Security Auditor, and Style Checker that work in parallel to give comprehensive pull-request feedback.',
    'official', 'approved',
    '{"agents":[{"role":"senior-reviewer","model":"gpt-4o","description":"Reviews code logic and architecture"},{"role":"security-auditor","model":"gpt-4o","description":"Identifies security vulnerabilities"},{"role":"style-checker","model":"gpt-4o-mini","description":"Enforces code style and conventions"}],"workflow":"parallel-review","version":1}',
    '["code-review","security","development"]',
    'development',
    0,
    0
  ),
  (
    gen_random_uuid(),
    'customer-support-team',
    'Customer Support Team',
    'A tiered customer support system: a Triage Agent routes tickets to specialists, with escalation to a Senior Support Agent for complex issues.',
    'official', 'approved',
    '{"agents":[{"role":"triage-agent","model":"gpt-4o-mini","description":"Classifies and routes incoming support tickets"},{"role":"specialist","model":"gpt-4o-mini","description":"Resolves common support questions"},{"role":"senior-support","model":"gpt-4o","description":"Handles complex escalations"}],"workflow":"triage","version":1}',
    '["support","customer-service","triage"]',
    'support',
    0,
    0
  ),
  (
    gen_random_uuid(),
    'content-creation-team',
    'Content Creation Team',
    'A content production pipeline: a Strategist plans topics, a Writer drafts content, and an Editor refines and polishes the final output.',
    'official', 'approved',
    '{"agents":[{"role":"strategist","model":"gpt-4o","description":"Plans content topics and outlines"},{"role":"writer","model":"gpt-4o","description":"Drafts articles and copy"},{"role":"editor","model":"gpt-4o-mini","description":"Proofreads and polishes content"}],"workflow":"pipeline","version":1}',
    '["content","writing","marketing"]',
    'content',
    0,
    0
  ),
  (
    gen_random_uuid(),
    'security-audit-team',
    'Security Audit Team',
    'A thorough security audit workflow: a Threat Modeler identifies risks, a Penetration Tester suggests attack vectors, and a Compliance Checker validates against security standards.',
    'official', 'approved',
    '{"agents":[{"role":"threat-modeler","model":"gpt-4o","description":"Identifies and maps threat vectors"},{"role":"penetration-tester","model":"gpt-4o","description":"Suggests potential attack scenarios"},{"role":"compliance-checker","model":"gpt-4o-mini","description":"Validates compliance with security standards"}],"workflow":"audit","version":1}',
    '["security","compliance","audit"]',
    'security',
    0,
    0
  )
ON CONFLICT (slug) DO NOTHING;
