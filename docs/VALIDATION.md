# Validation record

Date: 2026-11-04. Package: `n8n-nodes-dsers@0.1.0`. Branch: `codex/initial-dsers-node`. Initial implementation prepared for the public source repository https://github.com/dsers/dsers-n8n-nodes; no npm publication or n8n submission.

## Automated checks

- `npm run check`: passed TypeScript checking, official `@n8n/node-cli@0.55.4` strict lint, build, and 30 tests. No code lint errors or warnings. The CLI emitted a terminal-environment warning because both `NO_COLOR` and `FORCE_COLOR` were set.
- `npm run test:simulation`: passed 10 compiled-node HTTP tests, with 30 requests observed by Postman CLI 1.75.0. Covers handshake, negotiated/session headers, paginated discovery, unchanged JSON arguments/results, finite POST SSE, HTTP 401/403/429/503, tool errors (including a missing plan record with fixed guidance and no upstream text disclosure), and bounded timeout with no application retry. The local adapter routes the fixed production URL to the synthetic fixture; it does not exercise real credentials or n8n's OAuth helper.
- Official `@n8n/scan-community-package` source and compiled-code analysis: both passed using its exported `analyzePackage` API (`SOURCE_FILE_PATTERNS` and `dist/**/*.{js,json}` respectively). The public CLI scans published npm packages; registry and provenance checks remain pending.
- `npm pack`: produces a local review tarball only. Runtime code has no external dependencies except the n8n workflow peer. Build caches and local test fixtures are excluded.

## Real host checks

Host: official `docker.n8n.io/n8nio/n8n:2.46.4`, image digest `sha256:4384b9ff20a78bc1708c35ce7864f84f724611de7801fb36d715998db7c000f1`. Isolated local container bound to `127.0.0.1:5679`; no existing Cloud instance changed.

- The host loaded the DSers node, automatically generated its AI-tool variant, and loaded `dsersOAuth2Api` with the expected inherited OAuth2 and DCR settings. The initial custom-extension smoke test used the standard `CUSTOM` development namespace. A second smoke test installed the tarball through the package directory loader: canonical `n8n-nodes-dsers.dsers` and `n8n-nodes-dsers.dsersTool` both loaded, the credential loaded, and the example was accepted by the authenticated workflow creation API. This was the initial smoke test; the subsequent browser acceptance below exercised the installed package.
- The deployed host's actual HTTP-to-Axios adapter was invoked with this package's `{ ignore: true, except: [401] }` option. Assertions passed: 401 throws, while 200/403/429 resolve. The host OAuth helper source catches 401 for refresh. This establishes error-option compatibility for this host version, not a successful token refresh.
- Standard `npm run dev` on the development Mac failed during host installation with upstream `EBADPLATFORM` for `@napi-rs/canvas-linux-arm64-musl@1.0.11`. Compilation of this node succeeded; use the documented Docker preview instead.

## Browser and real execution acceptance

- The credential UI showed **Account connected**, and the stored credential had PKCE mode, the production MCP resource, and both access and refresh token fields. Discovery populated 60 tools. A real manual **Get Many** node execution returned **60 items** successfully in n8n 2.46.4.
- Executing `get_account_profile` with `{}` failed. A separate read-only diagnostic with the same credential returned `VALIDATION_ERROR` / `PLAN_RECORD_NOTFOUND` (`plan record not found`) for account and store-context reads. This is an account setup/plan-record failure; it does not establish a transport or scope failure.
- The user chose a different eligible test account. The in-app browser OAuth popup was blank, so authorization continued in Chrome after the user logged into local n8n. Chrome displayed the DSers authorization page and returned to an **Account connected** credential. An independent inactive **DSers Read-only Acceptance** workflow then executed through n8n's actual CLI execution engine with the stored credential: both `get_account_profile {}` and `list_stores {"view":"account_context"}` succeeded. Account payloads were captured only in the local process and were not copied into this report.
- The DCR credential requested the provider's advertised scope set, including write scopes. Only directory discovery and read-only business calls were executed. This is not a read-only authorization grant.
- The local preview now uses the private named Docker volume `dsers-n8n-preview-data` for the encryption key, credentials, workflows, and executions. Its editor/callback base URL is `http://127.0.0.1:5679`. No credential exports or tokens are included in this repository.
- Real host-managed refresh passed: the existing local credential's access token was temporarily replaced with a synthetic invalid value while preserving its refresh token. The same n8n execution engine obtained and persisted a new access token, then successfully ran both read-only account and store calls. The credential resource and configured scope were unchanged. The refreshed credential was retained; no tokens or decrypted backups were written into the project. This exercised n8n's OAuth helper and real provider refresh, rather than a standalone manual token request.
- New fixed error guidance for recognized missing-plan, scope, and entitlement failures passes local tests. Installation of this build into the preview is recorded separately below; the missing-plan guidance has not been observed in the UI with the now-eligible account.

## Installed build persistence check

The rebuilt `0.1.0` tarball was reinstalled by restarting the persistent preview. The installed `McpClient.js` exactly matched the local compiled build. `/healthz` returned `ok`; the existing acceptance workflow and refreshed credential survived the restart. Running `dsersReadAcceptance20261104` again through the actual n8n execution engine exited 0 with status `success`; account and store reads each returned one item with `content` and `structuredContent`. No business payloads were copied into the report.

## Required before release

- Browser **Account connected**, PKCE credential configuration/token presence, directory execution, actual host account/store reads, host-managed refresh, and post-refresh reads are established above. Raw PKCE exchange traffic was not captured independently. Revalidate any changed credential or transport code before release.
- Complete UI light/dark and credential/error presentation review. The example supplied the account-read step for the independently imported acceptance workflow; both read steps ran through the real execution engine.
- The user logged into npm as `dsers` and enabled 2FA for authorization and publishing. The package author/support contact remains `support@dsers.com`. CLI browser authorization completed and `npm whoami` returned `dsers`. Confirm final publisher metadata before first publication. Public documentation links must resolve.
- Publish through GitHub Actions with provenance, then run the full published-package scanner and submit to n8n. No approval is implied by local checks.

The automated node tests use synthetic business data. Browser acceptance first hit a missing plan record, then real host execution succeeded for production read-only account/store calls and repeated them after OAuth refresh; no business writes were executed. The example is a connection check, not a submitted public workflow template. n8n Cloud availability and all-version compatibility are not established.
