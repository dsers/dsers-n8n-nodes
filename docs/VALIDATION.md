# Validation record

Date: 2026-11-04. Package: `n8n-nodes-dsers@0.1.0`. Branch: `codex/initial-dsers-node`. Initial implementation prepared for the public source repository https://github.com/dsers/dsers-n8n-nodes; no npm publication or n8n submission.

## Automated checks

- `npm run check`: passed TypeScript checking, official `@n8n/node-cli@0.55.4` strict lint, build, and 25 tests. No code lint errors or warnings. The CLI emitted a terminal-environment warning because both `NO_COLOR` and `FORCE_COLOR` were set.
- `npm run test:simulation`: passed 9 compiled-node HTTP tests, with 27 requests observed by Postman CLI 1.75.0. Covers handshake, negotiated/session headers, paginated discovery, unchanged JSON arguments/results, finite POST SSE, HTTP 401/403/429/503, tool errors, and bounded timeout with no application retry. The local adapter routes the fixed production URL to the synthetic fixture; it does not exercise real credentials or n8n's OAuth helper.
- Official `@n8n/scan-community-package` source and compiled-code analysis: both passed using its exported `analyzePackage` API (`SOURCE_FILE_PATTERNS` and `dist/**/*.{js,json}` respectively). The public CLI scans published npm packages; registry and provenance checks remain pending.
- `npm pack`: produces a local review tarball only. Runtime code has no external dependencies except the n8n workflow peer. Build caches and local test fixtures are excluded.

## Real host checks

Host: official `docker.n8n.io/n8nio/n8n:2.46.4`, image digest `sha256:4384b9ff20a78bc1708c35ce7864f84f724611de7801fb36d715998db7c000f1`. Isolated local container bound to `127.0.0.1:5679`; no existing Cloud instance changed.

- The host loaded the DSers node, automatically generated its AI-tool variant, and loaded `dsersOAuth2Api` with the expected inherited OAuth2 and DCR settings. The initial custom-extension smoke test used the standard `CUSTOM` development namespace. A second smoke test installed the tarball through the package directory loader: canonical `n8n-nodes-dsers.dsers` and `n8n-nodes-dsers.dsersTool` both loaded, the credential loaded, and the example was accepted by the authenticated workflow creation API. The workflow was not executed; browser import and real credential execution remain pending.
- The deployed host's actual HTTP-to-Axios adapter was invoked with this package's `{ ignore: true, except: [401] }` option. Assertions passed: 401 throws, while 200/403/429 resolve. The host OAuth helper source catches 401 for refresh. This establishes error-option compatibility for this host version, not a successful token refresh.
- Standard `npm run dev` on the development Mac failed during host installation with upstream `EBADPLATFORM` for `@napi-rs/canvas-linux-arm64-musl@1.0.11`. Compilation of this node succeeded; use the documented Docker preview instead.

## Required before release

- Real n8n browser credential creation, discovery/DCR, DSers consent, PKCE exchange, actual scopes, account/store reads, token refresh, and a post-refresh call.
- Import and manually run the connection example with a real credential; UI light/dark review and credential/error UX.
- Confirm the npm publisher identity matches the public source repository `dsers/dsers-n8n-nodes` and that documentation links resolve.
- Publish through GitHub Actions with provenance, then run the full published-package scanner and submit to n8n. No approval is implied by local checks.

No production business tools were called by these node tests. The example is a connection check, not a submitted public workflow template. n8n Cloud availability and all-version compatibility are not established.
