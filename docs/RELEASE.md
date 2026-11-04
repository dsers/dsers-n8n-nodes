# Release and n8n verification preparation

Public source repository: https://github.com/dsers/dsers-n8n-nodes. No npm release or n8n submission has been made.

## Before publication

- The public source repository is `dsers/dsers-n8n-nodes`. Confirm the npm publisher belongs to DSers and matches the repository ownership. Check that public documentation links resolve before submission.
- Recheck npm name availability. The lookup returned 404 on 2026-11-04, which does not reserve the name.
- In a real n8n instance, verify credential creation, discovery, DCR, DSers consent, PKCE exchange, tool discovery, account/store reads, token expiry/refresh, and a post-refresh call. Check the actual scopes. Use an eligible DSers account.
- Import the example into a fresh workflow and run it with the user's credential. Review light/dark themes, tool selection, JSON input, and errors. This connection example alone is not a public-template submission.
- Review scope UX: automatic discovery may request all advertised read/write scopes; do not describe the credential as read-only.
- Run `npm ci`, `npm run check`, `npm run test:simulation`, the current n8n package scanner, and review `npm pack` contents.
- Confirm MIT code licensing, brand use, support ownership (`chuchaoliang@dserspro.com`), and matching GitHub/npm maintainer identity.

## Publishing

The included workflow publishes on a `v*` version tag, verifies the tag matches `package.json`, runs checks, and uses `npm publish --provenance --access public`. It grants `contents: read` and `id-token: write`.

Configure npm Trusted Publishing for the approved repository and `publish.yml`. A new package may need its first publication before a Trusted Publisher can be configured. Follow npm's current authorized first-publication setup. If a granular token is necessary, store it only in the repository's `NPM_TOKEN` secret, never in source or a workflow export.

Local `npm pack` creates a review artifact; it does not publish. GitHub creation, push, npm release, and submission remain separate steps.

## Submitting to n8n

After publication and verification above, submit the npm package at https://creators.n8n.io/nodes.

Suggested summary:

> DSers MCP integrates the DSers dropshipping service with n8n. Users authorize their own DSers account through OAuth2, discover available tools, inspect tool schemas, and execute configured tools using their original JSON arguments. The package uses n8n's authenticated HTTP helper, has no external runtime dependencies, and includes English documentation and a connection example.

Explain that this integrates one service, DSers. The endpoint is fixed to DSers, so the node is not an arbitrary multi-provider proxy. Original Tool contracts and DSers scope/plan/quota checks remain intact. Passing automated checks does not guarantee n8n approval. Community-node verification, MCP registry onboarding, and template review are separate routes.

## References checked on 2026-11-04

- https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes/
- https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines/
- https://docs.n8n.io/integrations/builtin/credentials/mcp/

Recheck current rules before submission.
