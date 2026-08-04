---
name: datazone-project-setup
description: Use when setting up Datazone locally, installing the datazone CLI, creating or switching profiles, cloning a Datazone project to your machine, or working out the edit-deploy-verify loop. Triggers on "datazone profile create", "clone my datazone project", "datazone login", "how do I deploy", "datazone auth", expired git push on a Datazone remote, or a first-time local setup.
---

# Datazone local setup and development lifecycle

A Datazone project is a git repository. You clone it, edit files, and push. Pushing is
what deploys — Datazone validates your definitions server-side and applies them.

There are two ways to work: the `datazone` CLI, or plain git. The CLI wraps git and adds
authentication and inspection commands. Plain git is enough if you only edit and push.

## Installing the CLI

```bash
pip install datazone
```

Requires Python 3.9+. Verify with `datazone --help`.

## Creating a profile

A profile stores which Datazone instance you talk to and your API key.

```bash
datazone profile create
```

It prompts for exactly three things:

| Prompt | Default | Notes |
|---|---|---|
| `Profile Name` | `default` | Any label. Use one per instance if you have several. |
| `Host` | `app.datazone.co` | **Self-hosted users must enter their own domain.** `https://` is added automatically if you omit the scheme. |
| `API Key` | – | Create one in the Datazone UI under API Keys. |

If a profile with that name already exists, it asks before replacing it.

The command validates immediately — it calls `GET /user/me` with your key and fails with
`Invalid api key!` if the key or host is wrong. A silent success means you are logged in.

Confirm any time with:

```bash
datazone auth test        # prints "Hello <name>, you are logged in!"
```

### Where credentials live

```
~/.datazone/settings.toml    # profiles
~/.datazone/crypto_key       # key used to encrypt stored API keys
```

Never commit either. If `crypto_key` is lost, recreate the profiles.

### Multiple profiles

```bash
datazone profile list
datazone profile setdefault      # choose which profile commands use
datazone profile delete
```

Useful when you have separate dev and production Datazone deployments.

## Cloning a project

```bash
datazone project list                  # find the project id
datazone project clone <project_id>
```

This creates a directory named after the project, initialises git, sets your commit
name/email from your Datazone user, adds the `origin` remote, and checks out `main`.

The remote URL is `https://<your-host>/git/<session_token>` — the token is embedded in
the URL, which is why no username or password is asked for.

**Without the CLI:** copy the repository URL from the project page in the UI and
`git clone` it normally. Everything below that is plain git works the same way.

## What a project repository contains

```
config.yml           # the manifest — nothing deploys unless it is listed here
pipelines/
apps/
endpoints/
```

`config.yml` declares `project_name`, `project_id`, and one list per resource type
(`pipelines`, `apps`, `endpoints`, `actions`, `flows`, `objects`). Paths are free-form;
the directory names above are convention, not requirement.

`config.yml` uses `extra="forbid"` — one unrecognised key fails the entire deploy.

## The daily loop

```bash
datazone project pull        # fast-forward from origin
# ...edit files...
datazone project deploy -c "add revenue chart"
```

`datazone project deploy` is not a build step. It does exactly this:

1. Refuses to run if origin has commits you do not have locally
2. Checks out `main`
3. `git add -A` — **stages everything**, including unrelated files
4. Commits (an auto-generated UUID if you give no `-c` message)
5. Pushes `main`

If you prefer control over what gets committed, use plain git instead:

```bash
git add apps/sales.yml config.yml
git commit -m "add revenue chart"
git push origin main
```

Both are identical from Datazone's point of view.

## Verifying a deploy

The push returns as soon as git accepts it. Validation happens afterwards, server-side,
so **a successful push does not mean a successful deploy.**

```bash
datazone project summary       # resources and their deploy status
datazone project activities    # recent pushes, deploy status, per-step errors
```

Or via the API with an `x-api-key` header:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/project/activities/<project_id>"
```

Deploy status moves `CHECKING` → `SUCCESS` or `FAILED`. On failure the activity records
which step failed and the validation error, naming the offending field. A failed load
leaves the previously deployed version in place — it never partially applies.

## Gotchas

- **The git remote token expires.** It is created at clone time and lives 90 days by
  default (configurable per deployment). When pushes start failing with an expired
  session, re-run `datazone project clone <project_id>` into a fresh directory, or
  update the remote URL with a new session token. Nothing about this is obvious from
  the git error.
- **`datazone project deploy` always targets `main`** and always stages everything. It
  is not branch-aware.
- **`datazone project pull` is fast-forward only**, and it refuses outright when a file
  has been modified both locally and on the remote. It lists the blocking files; commit
  or stash them first.
- **A resource removed from `config.yml` is deleted on the next deploy.** Removing the
  entry is how you delete an app, pipeline, or endpoint — so do not tidy the file
  casually.
- **Deploy is asynchronous.** Never report success on the basis of the push alone.

## Related

- `datazone-intelligent-app` — building dashboard YAML

Official docs: https://docs.datazone.co
