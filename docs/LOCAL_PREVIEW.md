# Local preview

Run `npm run dev` for the standard official node-CLI preview. It uses a separate development profile and does not change an existing Cloud instance. The standard custom-extension loader uses the `CUSTOM` namespace; recreate the example node from the picker when using that loader.

On the development Mac, npm installation of the n8n host (2.46.4) failed with `EBADPLATFORM` for upstream `@napi-rs/canvas-linux-arm64-musl@1.0.11`. Node compilation and tests passed. The Docker preview below uses the packaged community-node loader and the canonical node type `n8n-nodes-dsers.dsers`, matching the example.

Run from this package directory:

```sh
npm ci
npm run build
mkdir -p .n8n-local
npm pack --pack-destination .n8n-local
docker run --rm --name dsers-n8n-preview \
  -p 127.0.0.1:5679:5678 \
  -e N8N_SECURE_COOKIE=false \
  -e N8N_DIAGNOSTICS_ENABLED=false \
  -e N8N_PERSONALIZATION_ENABLED=false \
  -v "$PWD/.n8n-local/n8n-nodes-dsers-0.1.0.tgz:/tmp/dsers-node.tgz:ro" \
  --entrypoint /bin/sh \
  docker.n8n.io/n8nio/n8n:2.46.4 \
  -c 'mkdir -p /home/node/.n8n/nodes/node_modules/n8n-nodes-dsers && tar -xzf /tmp/dsers-node.tgz -C /home/node/.n8n/nodes/node_modules/n8n-nodes-dsers --strip-components=1 && exec n8n start'
```

Open `http://127.0.0.1:5679`, complete local owner setup, create a workflow, and search for **DSers MCP** or import `examples/read-account.json`. Create a **DSers OAuth2 API** credential and personally complete DSers consent. The production MCP URL is fixed and needs a real account. Never paste tokens into node fields.

The loopback-only HTTP preview disables secure cookies. It has no persistent data volume: removing the container removes its settings and credentials. Stop it with Ctrl+C or `docker stop dsers-n8n-preview`. Rebuild, repack, and restart to pick up changes. See [VALIDATION.md](VALIDATION.md) for checks actually performed; instructions alone are not a claim that OAuth or UI testing passed.
