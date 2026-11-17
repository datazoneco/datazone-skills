---
name: datazone-flow
description: Use when building or debugging a Datazone Flow — declarative YAML orchestration with nodes that call LLMs, decision models, REST APIs, actions, and Python, wired by connections. Triggers on "datazone flow", "flow node", "rest_call", "llm_call", "decision node", "for_each", "flow schedule", editing a file registered under `flows:` in config.yml, or a flow that fails validation.
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
| `decision` | Ask a decision model typed questions, get probabilities | `model_account_id`, `model`, `state`, `questions`, `save_as` (default `decision`), `timeout_sec` |
| `rest_call` | HTTP request | `url`, `method`, `headers`, `query`, `json_body`, `timeout_sec`, `save_as`, `auth_type`, `username`, `password`, `token`, `api_key_name`, `api_key_value` |
| `action_call` | Run an action | `action_id`, `parameters`, `save_as`, `timeout_sec` |
| `sql` | `SELECT` against project datasets | `query`, `save_as` (default `result`), `timeout_sec` |
| `pipeline_run` | Start a pipeline, wait for it by default | `pipeline_id`, `transform_selection`, `compute`, `env_vars`, `wait_for_completion`, `timeout_sec`, `poll_interval_sec`, `save_as` |
| `extract_run` | Start an extract, wait for it by default | `extract_id`, `reset_state`, `wait_for_completion`, `timeout_sec`, `poll_interval_sec`, `save_as` |
| `python` | Run code | `code` |
| `response` | Terminal, returns a value | `{}` |
| `output` | Terminal, writes somewhere | `kind`, `dataset_alias`, `materialized`, `url`, `path` |

Each node also accepts an optional `runtime` block: `mode` (`auto`, `subprocess`,
`pod`), `engine`, `timeout_sec`, `memory_mb`, `max_input_rows`, `max_input_bytes`.

`datazone flow node-types` lists every node type your deployment has; `datazone flow
node-types <type>` prints its config schema. Check it before using a node this skill
doesn't cover.

## Data and execution nodes

Refresh a pipeline, read its output, then decide. This flow was run end to end:

```yaml
  - id: refresh
    type: pipeline_run
    config:
      pipeline_id: "<pipeline_id>"
      wait_for_completion: true        # default; fails if the pipeline is already running
      timeout_sec: 900                 # default 3600

  - id: load
    type: sql
    config:
      query: "SELECT id, body FROM tickets_b9ffef WHERE id = {parameters[ticket_id]} LIMIT 1"
      save_as: rows
```

- `sql` queries datasets by their **alias** (`tickets_b9ffef`, from the catalog or
  `GET /dataset/list`), not the transform name. A materialized output's alias gets a random
  suffix on its first run, so run the pipeline once before writing the query.
- `sql` returns `{save_as: {"data": [...], "columns": [...], "row_count": n}}`. Reach rows
  through `data`: `{inputs[in][rows][data][0]}`. `{inputs[in][rows][0]}` fails with
  `references 0, which is missing`.
- `query` uses `str.format()` templating and the value is pasted in as is. Quote strings
  yourself and keep untrusted input out of it.
- `pipeline_run` / `extract_run` run inside the flow engine. With
  `wait_for_completion: true` the node fails if the execution doesn't end in `SUCCESS`.
  `transform_selection` takes `name`, `*name` (with upstream) or `name*` (with downstream).

## Decision nodes

A `decision` node asks a **decision model** (a model of kind `DECISION` on a model
account) questions about some state and returns probabilities, not text. Use it for
routing, triage and scoring, where an `llm_call` would need parsing.

```yaml
  - id: classify
    type: decision
    config:
      model_account_id: "<model_account_id>"   # omit to use the organisation's Orion AI account
      model: jev-latest                        # a DECISION model on that account
      state: "Ticket: {parameters[ticket]}"    # str.format(); omit to send the node's input as JSON
      save_as: decision
      questions:
        - name: urgent
          type: noul                           # probability that a statement is true
          instructions: Does the customer need help today?
          criteria:
            true: Outage, payment failure or a hard deadline today
            false: A question, a feature request or anything that can wait
        - name: team
          type: choice                         # one label out of criteria (label -> description)
          instructions: Which team should handle this ticket?
          criteria:
            billing: Invoices, payments, refunds
            technical: Errors, outages, integrations
            sales: Pricing, upgrades, new contracts
        - name: severity
          type: score                          # a position on ordered levels, lowest first
          instructions: How severe is the problem for the customer?
          criteria: [low, medium, high, critical]
```

The result, under `save_as`, keyed by question name:

```json
{"decision": {
  "urgent":   {"type": "noul", "noul": 0.98},
  "team":     {"type": "choice", "choice": "technical",
               "probabilities": {"billing": 0.37, "technical": 0.63, "sales": 0.0}, "confidence": 0.44},
  "severity": {"type": "score", "score": 2.98, "legend": {"0": "low", "1": "medium", "2": "high", "3": "critical"},
               "probabilities": {"0": 0.0, "1": 0.0, "2": 0.02, "3": 0.98}, "confidence": 0.98}}}
```

Branch on it with an `if` node: `left: "inputs['in']['decision']['urgent']['noul']"`,
`operator: gt`, `right: 0.8`. Validation rejects a question without `instructions`,
duplicate question names, a `choice` with fewer than two options and a `score` with fewer
than two levels.

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

**`llm_call`, `action_call` and the `decision` node's `state` use Python `str.format()`** — bracket chains, no dots:

```yaml
prompt: "Summarise this ticket: {inputs[in][body]}"
```

**`if`, `for_each`, and `rest_call` evaluate Python expressions** — normal subscripting:

```yaml
left: "inputs['in']['amount'] > parameters['threshold']"
operator: is_true        # the default `eq` would compare the result with `right` (None)
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

## Running and scheduling

```bash
datazone flow run <flow_id> --parameters '{"ticket": "..."}'   # prints the run id
datazone flow runs show <run_id>                               # status, result, per-node status
datazone flow runs logs <run_id>                               # step logs
datazone flow schedule create <flow_id> --name daily --expression '0 6 * * *' --parameters '{...}'
```

A cron expression that can never fire (for example `0 0 30 2 *`, 30 February) is
rejected with a 422 `Cron expression has no upcoming date`.

## Gotchas

- **Invalid flows are skipped, not reported as deploy failures.** Confirm the flow
  exists after pushing.
- **Bracket syntax in `llm_call` is not the same as the Python syntax in `if`.** Mixing
  them is the most common error.
- **`from_port` is required on `if` connections.**
- **A flow has at most one `response` node.** Route both branches of an `if` into the same
  `response`; two fail validation with `flow may contain at most one response node`.
- **`if` takes `left` (a Python expression), `operator` and `right`.** Operators: `eq`
  (default), `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `is_true`, `is_false`,
  `is_empty`, `is_not_empty`. The node's output has `value` (what `left` evaluated to) and
  `branch`.
- **`if`, `for_each`, and `rest_call` expressions are evaluated with real `eval()`.**
  The subprocess sandbox provides isolation, not syntactic restriction — never build an
  expression from untrusted input.
- **`for_each` needs `max_iterations`** for anything whose length you do not control.
- **The UI writes back to the repository.** Editing a flow in the Flow Builder commits
  to git, so pull before editing the file locally or you will conflict.

## Verifying

Validate the document **before** pushing. Because invalid flows are skipped silently,
this is the only place you see the errors:

```bash
datazone flow validate -f flows/triage.yml
# Flow document is valid ✅   — or a table of errors per node
```

After pushing, check the project page for the flow, and the run history for execution results. Or:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/flow/list?filters=\[project.\$id\]\[\$eq\]:<project_id>"
```

A flow missing from that list failed validation.

## Related

- `datazone-api` — calling flows and reading run status
- `datazone-project-setup` — the deploy loop

Official docs: https://docs.datazone.co/reference/flows/overview
