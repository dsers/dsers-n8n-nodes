# n8n-nodes-dsers

DSers MCP connects n8n workflows to the [DSers](https://www.dsers.com/) MCP service. Discover available tools, inspect their schemas, and call a selected tool with its original JSON arguments.

**Status:** development implementation, not yet published to npm or verified by n8n. Real n8n OAuth consent and refresh remain release checks. See [validation](docs/VALIDATION.md) and [release preparation](docs/RELEASE.md).

## Operations

| Resource | Operation  | Behavior                                                                                  |
| -------- | ---------- | ----------------------------------------------------------------------------------------- |
| MCP Tool | Get Many   | Discover complete tool definitions across all pages; one output item per tool.            |
| MCP Tool | Get Schema | Return the selected tool's complete definition, including available input/output schemas. |
| MCP Tool | Execute    | Call the selected tool with the supplied JSON object.                                     |

The default operation is **Get Many**. Opening the tool selector discovers definitions and never executes a business tool. Available tools depend on DSers and the account; this node does not freeze a catalog count.

## Installation

For development:

```sh
npm ci
npm run build
npm run dev
```

This starts a separate local n8n instance, normally at `http://localhost:5678`. It does not install anything into an existing Cloud account. A Docker alternative is in [LOCAL_PREVIEW.md](docs/LOCAL_PREVIEW.md).

After npm publication, self-hosted administrators can install `n8n-nodes-dsers` through **Settings → Community Nodes**, subject to instance policy. Discovery and installation as a verified node, including on n8n Cloud, require n8n's separate approval. npm publication alone does not grant approval.

## Credentials

Create a **DSers OAuth2 API** credential, click **Connect my account**, sign in to DSers, and review the consent screen. Select that credential in the node.

- The credential extends n8n OAuth2 and enables Dynamic Client Registration (DCR).
- The server and protected resource are fixed to `https://ai.dsers.com/mcp`.
- n8n handles discovery, registration of its actual callback, PKCE, and credential storage. No token belongs in workflow parameters.
- Use a current n8n release supporting DCR on OAuth2 credentials. Older releases are not claimed compatible.
- n8n may derive scopes from server discovery, including advertised write scopes. Review the consent screen; this credential is not described as read-only authorization.
- DSers account permissions, OAuth scopes, eligible plan, and quotas still apply. Account/store checks require their read scopes and `plan:read`; order queries additionally require `order:read`.
- Reconnect after changing authorized permissions. This node does not provide a separate incremental-consent UI.

MCP authorization remains in DSers AIOAuth; store/supplier connection capabilities remain with the existing business services.

## First connection check

1. Import [examples/read-account.json](examples/read-account.json) into a development or supported self-hosted instance.
2. Assign the DSers OAuth2 API credential to **Read DSers Account**.
3. Execute manually and confirm the account response has `isError: false`.

This example calls `get_account_profile` with `{}` and contains no credentials or private identifiers. It is a connection example, not a submitted template. Real-account import-and-run verification remains required.

To query store context, choose `list_stores` and supply:

```json
{ "view": "account_context" }
```

Use **Get Schema** for the current tool's fields and constraints. Arguments retain their field names, nesting, arrays, omitted fields, `null`, and empty values. The node adds no business defaults. DSers validates arguments.

## Output, errors, and retries

Execute returns the original successful MCP result object as one n8n item, preserving `content`, `structuredContent`, `_meta`, and other fields. Text remains text; schemas and binary-content representation are not transformed.

HTTP errors, JSON-RPC errors, and `isError: true` results fail the node. Recognized missing-plan-record, insufficient-scope, and subscription/Credits errors provide fixed recovery guidance without echoing upstream messages. n8n's **On Error → Continue** setting emits a safe error item and continues with later inputs. Outputs retain input-item pairing.

The application does not retry tool calls, recreate expired sessions, or replay timeouts. n8n's OAuth helper may refresh and retry an unauthorized request. Workflow-level **Retry On Fail** and manual reruns are separate features: configure them deliberately for tools that modify products, orders, or settings. A write timeout may leave its outcome unknown.

Timeout is per HTTP request (1–300 seconds), not per whole execution. The client targets DSers' stateless Streamable HTTP service, supporting finite JSON/POST SSE responses, discovery pagination, and negotiated headers. It does not implement legacy SSE connections, resumable streams, or server-initiated sampling.

## AI Agent use

The node is usable as an AI Agent tool. Configure the specific tool and arguments needed by the workflow. Review write effects, permissions, and approval/retry behavior before enabling write tools.

## Development

```sh
npm run check
npm run test:simulation
npm pack --dry-run
```

The HTTP simulation requires Postman CLI 1.75.0 or a compatible later version. It exercises the compiled node over local HTTP with synthetic data and stops the mock afterward. It does not establish real OAuth compatibility.

There are no runtime external dependencies beyond n8n's `n8n-workflow` peer. Runtime code uses n8n's authenticated HTTP helper and reads no files or environment variables. Local test scripts use Node built-ins separately.

## Support and license

- Website: https://www.dsers.com/
- Contact: chuchaoliang@dserspro.com
- License: [MIT](LICENSE)
- Source: https://github.com/dsers/dsers-n8n-nodes

The icon comes from DSers' public website favicon. The code license does not grant rights to DSers trademarks.
