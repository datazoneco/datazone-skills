---
name: datazone-container
description: Use when adding, deploying or debugging a Datazone Container — a long-running service built from a Dockerfile in the project repository or run from a public image, declared under `containers:` in config.yml. Triggers on "datazone container", "deploy a model server / API / web tool on Datazone", `Container(...).get_client()`, the `/container-proxy/` URL, a container stuck in DEPLOYING, ending in ERROR or TIMEOUT, answering 401/404/502, or filling an Empty Vector with embeddings from your own model.
---

# Datazone Containers

A container is a long-running HTTP service that Datazone builds and runs for a project:
a model server, an internal API, a small web tool. Actions and pipelines call it with
`Container("<alias>").get_client()`; `authenticated` and `public` containers also get a URL.

Most of the rules below exist because breaking them gives a container that **deploys and
then fails**: a crash loop, a 502, or a web page with no styles.

## The workflow

1. Add the container under `containers:` in `config.yml` (and its `Dockerfile` folder)
2. `git add`, `git commit`, `git push` — this **registers** the container on the branch; it does not deploy it
3. Deploy — **Deploy** on the project's **Containers** page, or `POST /container/deploy/{id}?branch=<branch>`
4. Wait for `RUNNING` — `GET /container/get-by-id/{id}?branch=<branch>`, read `definition.status` and `definition.error_message`
5. Call it — `Container("<alias>").get_client()` from code, or the URL on its Overview tab

Every later change (code, `config.yml` entry, environment variables) needs another deploy.
One deployment runs per branch (a second deploy while one is in progress is a 409), and by
default at most 2 branches of a container run at once — stop one to deploy a third.
A failed deploy leaves the previous `RUNNING` one serving.

## config.yml

```yaml
containers:
  - alias: clip-embedder         # [a-z0-9-], starts and ends alphanumeric, max 40, unique per project
    name: CLIP Embedder          # optional display name
    path: containers/clip        # folder with the Dockerfile = build context
    dockerfile: Dockerfile       # optional, relative to path
    port: 8000                   # required: the port the process listens on
    replicas: 1
    compute: SMALL               # 2XSMALL (default) | XSMALL | SMALL | MEDIUM | LARGE | XLARGE
    access: internal             # internal (default) | authenticated | public
    healthcheck_path: /health    # optional, strongly recommended
    files:                       # optional, only with `path`
      - source: models/clip      # folder in the project's file container
        target: weights          # folder in the build context

  - alias: whoami
    image: traefik/whoami:v1.10  # instead of path: a public image, pinned tag
    port: 80
    access: public
```

- **Exactly one of `path` or `image`.** Both or neither fails the `config.yml` deploy.
- **A missing Dockerfile or more than 3 replicas** (the default limit) still registers the
  container, with `config_error` set; it can't be deployed until fixed.
- **`image` is pulled without credentials.** A private registry image never starts. Pin a tag.
- **`files` works only with `path`.** Use it for model weights too big for git; the Dockerfile then `COPY weights/ ...`.

| Compute | vCPU | Memory |
|---|---|---|
| `2XSMALL` | 1 | 4 GB |
| `XSMALL` | 2 | 8 GB |
| `SMALL` | 4 | 16 GB |
| `MEDIUM` | 8 | 32 GB |
| `LARGE` | 8 | 64 GB |
| `XLARGE` | 16 | 128 GB |

Each replica reserves its full size and is billed (DCU) every minute it runs. Stop
containers you are not using: **Stop**, or `POST /container/stop/{id}?branch=<branch>`.

## Access levels

| `access` | Who | How |
|---|---|---|
| `internal` | Actions and pipelines of the same project only | `Container` |
| `authenticated` | Org members with read permission on the container | `x-api-key` header only — a browser session is not accepted |
| `public` | Anyone with the URL | Plain HTTP |

An `internal` container answers 404 at its URL — that is expected, not a bug.
`Container` reaches every access level.

## The rules that break containers

**The process runs as uid 10001, non-root, all capabilities dropped.** `USER` in the
Dockerfile is overridden. An image that writes to its own install folders at runtime
(stock `nginx`, many apps that write next to their code) crashes with permission denied.
Write to `/tmp`, or use an unprivileged variant (for example `nginxinc/nginx-unprivileged`).

**Listen on `0.0.0.0`, on the declared `port`.** `127.0.0.1` or a different port
gives a container that runs but never answers (`502 Container is not reachable.`).

**Set `healthcheck_path` for anything slow to start.** Without it, traffic arrives as soon
as the process starts, before a model has loaded. With it, a replica gets traffic only
after the path answers 2xx, and is restarted when it stops answering. Make the path cheap.

**A web UI must use relative URLs.** The container is served under
`/api/v1/container-proxy/<container-slug>/<branch-slug>/` and receives requests with that
prefix removed. `/assets/app.js` resolves against the domain root and 404s;
`./assets/app.js` works. For Vite, set `base: "./"`.

**The container gets no Datazone credentials.** The proxy removes `Authorization`,
`x-api-key` and cookies before forwarding, and drops any `Set-Cookie` the container sends.
To call the Datazone API from the container, create an API key and add it as a **secret**
environment variable.

**Egress is public internet only.** A container can download from the internet but cannot
reach services inside the cluster. Ingress comes only from the Datazone proxy and the
organisation's pipelines.

**A response must start within 300 seconds.** Longer work belongs in a pipeline or a
background job that the container starts and the caller polls.

## Environment variables

Set on the container's **Environment** tab, or `PUT /container/update-env/{id}`:

```json
{"env": [{"name": "MODEL_NAME", "value": "clip-vit-b-32", "is_secret": false}]}
```

Omit `branch` for the shared list; add `"branch": "feature-x"` for that branch's overrides.
Each call **replaces** the list. A secret comes back as `********`; sending the mask
back keeps the stored value. Changes apply on the next deploy.

## Calling it from code

```python
from datazone.actions import action, Container   # in a pipeline: from datazone import Container

@action
def embed(text: str):
    response = Container("clip-embedder").get_client().post("/embed/text", json={"texts": [text]})
    response.raise_for_status()
    return response.json()["embeddings"][0]
```

`Container(alias, branch="main").get_client(timeout=300)` returns a client with `get`, `post`, `put`, `patch`,
`delete` and `request(method, path)`, taking `requests` keyword arguments and returning a
`requests.Response`. **`branch` defaults to `main`**, not the branch the code runs on:
pass it explicitly when testing a container deployed on a feature branch.

If the container is missing or not running on that branch, `get_client()` raises
`Container '<alias>' on branch '<branch>' cannot be called: <reason>`.

## Filling an Empty Vector

The usual pairing: a container runs the embedding model, and a pipeline or action writes
the embeddings to an **Empty Vector** (created in the UI with a name, dimension and
metric) with the `Vector` SDK:

```python
from datazone.actions import action, Container, Vector

@action
def index_image(path: str):
    embedding = Container("clip-embedder").get_client().post("/embed/image", json={"path": path}).json()["embedding"]
    Vector("dog-images").upsert([{"id": path, "vector": embedding, "payload": {"path": path}}])

@action
def search_images(query: str):
    embedding = Container("clip-embedder").get_client().post("/embed/text", json={"texts": [query]}).json()["embeddings"][0]
    return Vector("dog-images").search(vector=embedding, limit=5)
```

`Vector(name)` methods: `upsert(points)`, `search(vector, limit=10, score_threshold=None,
filter=None)`, `get(ids)`, `delete(ids=None, filter=None)`, `count(filter=None)`,
`clear()`. Each point is `{"id": str | int, "vector": [...], "payload": {...}}`; `upsert`
replaces an existing `id`. `filter` matches payload values exactly: `{"breed": "husky"}`
or `{"breed": ["husky", "akita"]}`.

- **Every vector must have the Empty Vector's dimension**, or the call fails with
  `Vector '<name>' takes N dimensions, got M.`
- **Agents, the Explore tab and vector endpoints cannot search an Empty Vector** — there
  is no text to embed. Search it in an action, and expose the action through an action
  endpoint if needed.

## Debugging

| Symptom | Likely cause |
|---|---|
| `ERROR` while `BUILDING` | Dockerfile error — read the build log: `GET /container-deployment/get-log/{deployment_id}` |
| `ERROR` "keeps restarting" / `TIMEOUT` | Process crashes (often permission denied as uid 10001) or `healthcheck_path` never answers 2xx |
| `TIMEOUT` with `ImagePullBackOff` | `image` is private, misspelled, or the tag doesn't exist |
| 502 "Container is not reachable." | Listening on `127.0.0.1` or another port, or the request took over 300 s |
| 404 at the URL | `access: internal`, or the branch slug in the URL is wrong |
| 503 at the URL | Container is not `RUNNING` on that branch |
| 401 at the URL | `authenticated` container called without `x-api-key` (opening it in a browser always gives 401) |
| Page loads without styles or scripts | Absolute asset URLs; see "relative URLs" above |

## Related

- `datazone-pipeline` — calling a container from a transform
- `datazone-endpoint` — exposing an action that calls a container
- `datazone-project-setup` — cloning, profiles, the deploy loop
- `datazone-api` — auth and filter syntax for the calls above

Official docs: https://docs.datazone.co/reference/development/containers
