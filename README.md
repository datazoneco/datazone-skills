# Datazone Skills

Official [Agent Skills](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-with-agent-skills)
for building on [Datazone](https://datazone.co).

Skills teach your coding agent how Datazone projects actually work — file layout,
YAML schemas, validation rules, and the deploy loop — so it gets things right the
first time instead of guessing from the docs.

Works with Claude Code, Cursor, Codex, Copilot, and any agent that reads `SKILL.md`.

## Install

```bash
npx skills add datazoneco/datazone-skills
```

Or in Claude Code:

```
/plugin marketplace add datazoneco/datazone-skills
```

Or clone the skill directory into your agent's skills folder:

```bash
git clone https://github.com/datazoneco/datazone-skills
cp -r datazone-skills/skills/datazone-intelligent-app ~/.claude/skills/
```

## Available skills

| Skill | Use it for |
|---|---|
| `datazone-project-setup` | Installing the CLI, creating a profile, cloning a project, the edit-deploy-verify loop |
| `datazone-pipeline` | Writing `@transform` pipelines — inputs, outputs, materialization, the DAG |
| `datazone-intelligent-app` | Building and debugging Intelligent App dashboards — charts, filters, tabs, widgets |
| `datazone-endpoint` | Exposing a query, action, or vector search as a REST API |
| `datazone-flow` | Declarative YAML orchestration — LLM, REST, action, and Python nodes |
| `datazone-knowledge-object` | Versioned business entities — fields, primary keys, relationships, actions |
| `datazone-api` | Calling the Datazone REST API — auth, filters, sorting, pagination, links |

More on the way: extracts.

## Requirements

A Datazone project repository cloned locally — either with the CLI:

```bash
pip install datazone
datazone profile create      # profile name, host, API key
datazone project clone <project_id>
```

or by `git clone` on the repository URL shown on your project page.

You deploy by pushing. Datazone validates and applies your definitions on `git push` —
there is no build step. Validation is server-side and asynchronous, so check the deploy
status afterwards rather than trusting the push.

See the `datazone-project-setup` skill for the full flow.

## Docs

Full documentation: [docs.datazone.co](https://docs.datazone.co) ·
Agent-readable index: [docs.datazone.co/llms.txt](https://docs.datazone.co/llms.txt)

## Contributing

Skills live in `skills/<skill-name>/` with a `SKILL.md`, an optional `references/`
folder for detail the agent loads on demand, and `examples/` for working files.

Examples are validated against Datazone's own Pydantic models — if you add one, make
sure it deploys.
