---
name: datazone-flow
description: Use when building or debugging a Datazone Flow — declarative YAML orchestration with nodes that call LLMs, REST APIs, actions, and Python, wired by connections. Triggers on "datazone flow", "flow node", "rest_call", "llm_call", "for_each", editing a file registered under `flows:` in config.yml, or a flow that fails validation.
---

# Building Datazone flows

A flow is a directed graph of nodes declared in YAML. Nodes call LLMs, REST APIs,
actions, or Python; connections wire outputs to inputs. Flows run on demand or on a
cron schedule.

## The workflow

1. Write the flow YAML (convention: `flows/<name>.yml`)
2. Register it in `config.yml` under `flows:`
3. `git add`, `git commit`, `git push`

```yaml
# config.yml
flows:
  - path: flows/weather.yml
```

**Invalid flows are skipped silently.** Unlike every other resource, a flow that fails
validation does not fail the deploy — it is logged and ignored. If your flow does not
appear after a push, it did not validate. Never assume a green deploy means the flow
loaded.

## Document structure

```yaml
flow:
  name: "Daily Weather Report"

nodes:
  - id: start
    type: start
    config: {}

  - id: fetch
    type: rest_call
    config:
      url: "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current=temperature_2m"
      method: GET
      save_as: weather

  - id: reply
    type: response
    config: {}

connections:
  - from: start
    to: fetch
  - from: fetch
    to: reply
```

A minimal flow needs `flow.name`, a `start` node, and at least one `response` or
`output` node.

## Nodes

| Type | Purpose | Key config |
|---|---|---|
| `start` | Entry point | `{}` |
| `if` | Branch | `left`, `operator`, `right` |
| `for_each` | Loop | `items`, `item_as`, `index_as`, `max_iterations`, `save_as`, `body` |
| `llm_call` | Call a model | `model_account_id`, `model`, `prompt`, `system_prompt`, `save_as`, `timeout_sec` |
| `rest_call` | HTTP request | `url`, `method`, `headers`, `query`, `json_body`, `timeout_sec`, `save_as`, `auth_type`, `username`, `password`, `token`, `api_key_name`, `api_key_value` |
| `action_call` | Run an action | `action_id`, `parameters`, `save_as`, `timeout_sec` |
| `python` | Run code | `code` |
| `response` | Terminal, returns a value | `{}` |
| `output` | Terminal, writes somewhere | `kind`, `dataset_alias`, `materialized`, `url`, `path` |

Each node also accepts an optional `runtime` block: `mode` (`auto`, `subprocess`,
`pod`), `engine`, `timeout_sec`, `memory_mb`, `max_input_rows`, `max_input_bytes`.

## Connections

```yaml
connections:
  - from: check
    to: send_alert
    from_port: "true"      # required when branching from an `if`
    to_port: in            # optional named input
```

`from_port` is mandatory on `if` nodes — without it the branch is ambiguous and the flow
fails validation.

## Templating — the syntax differs per node type

This is the single biggest source of confusion. Three different mechanisms:

**`llm_call` and `action_call` use Python `str.format()`** — bracket chains, no dots:

```yaml
prompt: "Summarise this ticket: {inputs[in][body]}"
```

**`if`, `for_each`, and `rest_call` evaluate Python expressions** — normal subscripting:

```yaml
left: "inputs['in']['amount'] > parameters['threshold']"
items: "inputs['in']['orders']"
```

**`python` nodes get the dicts directly:**

```yaml
type: python
config:
  code: |
    def handler(inputs, parameters):
        return {"total": inputs["in"]["amount"] * 1.1}
```

`inputs` is keyed by incoming port name; `parameters` holds run parameters and loop
context. Missing keys raise an explicit error rather than rendering empty — good, but it
means a typo fails the run rather than producing a blank.

## Passing data between nodes

`save_as` names a node's result so downstream nodes can reach it. An `if` node's output
merges the upstream dict with `branch` and `value` keys, so context survives a branch.

## Gotchas

- **Invalid flows are skipped, not reported as deploy failures.** Confirm the flow
  exists after pushing.
- **Bracket syntax in `llm_call` is not the same as the Python syntax in `if`.** Mixing
  them is the most common error.
- **`from_port` is required on `if` connections.**
- **`if`, `for_each`, and `rest_call` expressions are evaluated with real `eval()`.**
  The subprocess sandbox provides isolation, not syntactic restriction — never build an
  expression from untrusted input.
- **`for_each` needs `max_iterations`** for anything whose length you do not control.
- **The UI writes back to the repository.** Editing a flow in the Flow Builder commits
  to git, so pull before editing the file locally or you will conflict.

## Verifying

Check the project page for the flow, and the run history for execution results. Or:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/flow/list?filters=\[project.\$id\]\[\$eq\]:<project_id>"
```

A flow missing from that list failed validation.

## Related

- `datazone-api` — calling flows and reading run status
- `datazone-project-setup` — the deploy loop

Official docs: https://docs.datazone.co/reference/flows/overview
