import type { IDataObject, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const MCP_ENDPOINT = 'https://ai.dsers.com/mcp';
export const CREDENTIAL_TYPE = 'dsersOAuth2Api';
const PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'];

export interface McpHttpResponse {
	statusCode: number;
	headers: Record<string, unknown>;
	body: unknown;
}

export type McpSender = (
	body: IDataObject,
	headers: Record<string, string>,
) => Promise<McpHttpResponse>;

export interface McpTool extends IDataObject {
	name: string;
	inputSchema: IDataObject;
	title?: string;
	description?: string;
}

export class McpError extends Error {
	constructor(
		message: string,
		readonly statusCode?: number,
	) {
		super(message);
		this.name = 'McpError';
	}
}

export function isObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function header(headers: Record<string, unknown>, name: string): string | undefined {
	const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
	return entry && typeof entry[1] === 'string' ? entry[1] : undefined;
}

function parseEnvelope(body: unknown, contentType: string, id: number, node: INode): IDataObject {
	let candidates: unknown[];
	try {
		if (typeof body !== 'string') {
			candidates = [body];
		} else if (contentType.includes('text/event-stream')) {
			candidates = body
				.replace(/\r\n/g, '\n')
				.split('\n\n')
				.map((event) =>
					event
						.split('\n')
						.filter((line) => line.startsWith('data:'))
						.map((line) => line.slice(5).replace(/^ /, ''))
						.join('\n'),
				)
				.filter(Boolean)
				.map((data) => JSON.parse(data) as unknown);
		} else {
			candidates = [JSON.parse(body) as unknown];
		}
	} catch {
		throw new NodeOperationError(node, 'DSers returned an invalid MCP response.');
	}
	const response = candidates.find(
		(candidate) => isObject(candidate) && candidate.jsonrpc === '2.0' && candidate.id === id,
	);
	if (!isObject(response)) {
		throw new McpError('DSers returned no matching MCP response.');
	}
	if (isObject(response.error)) {
		const code = response.error.code;
		throw new McpError(
			`DSers rejected the MCP request${typeof code === 'number' ? ` (${code})` : ''}. Check the selected tool, arguments, and account permissions.`,
		);
	}
	if (!isObject(response.result)) {
		throw new McpError('DSers returned an invalid MCP result.');
	}
	return response.result;
}

function toolFailureMessage(result: IDataObject): string {
	if (Array.isArray(result.content)) {
		for (const item of result.content) {
			if (!isObject(item) || item.type !== 'text' || typeof item.text !== 'string') continue;
			let detail: unknown;
			try {
				detail = JSON.parse(item.text) as unknown;
			} catch {
				continue;
			}
			if (!isObject(detail)) continue;
			// Map recognized codes to fixed guidance; never echo upstream messages, URLs, or tokens.
			if (detail.code === 'VALIDATION_ERROR' && detail.reason === 'PLAN_RECORD_NOTFOUND') {
				return 'DSers has no subscription record for this account (PLAN_RECORD_NOTFOUND). Complete account setup in DSers or contact support@dsers.com, then reconnect an account eligible for MCP access. The tool was not retried.';
			}
			if (detail.code === 'INSUFFICIENT_SCOPE') {
				return 'DSers requires additional OAuth permissions (INSUFFICIENT_SCOPE). Reconnect the DSers credential and review the requested scopes. The tool was not retried.';
			}
			if (detail.code === 'PLAN_RESTRICTION') {
				return 'The DSers subscription or Credits entitlement does not allow this operation (PLAN_RESTRICTION). Check the account plan and Credits in DSers before running again. The tool was not retried.';
			}
		}
	}
	return 'The DSers tool reported a failure. Check its required permissions, plan, and input arguments. The tool was not retried.';
}

/** A bounded Streamable HTTP client for DSers; no filesystem, environment, or SDK access. */
export class McpClient {
	private requestId = 0;
	private protocolVersion = PROTOCOL_VERSIONS[0];
	private sessionId?: string;
	private connected = false;

	constructor(
		private readonly send: McpSender,
		private readonly node: INode,
	) {}

	private async post(body: IDataObject): Promise<McpHttpResponse> {
		const headers: Record<string, string> = {
			Accept: 'application/json, text/event-stream',
			'Content-Type': 'application/json',
		};
		if (this.connected) headers['MCP-Protocol-Version'] = this.protocolVersion;
		if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
		let response: McpHttpResponse;
		try {
			response = await this.send(body, headers);
		} catch {
			throw new NodeOperationError(
				this.node,
				'Could not complete the DSers request. Check the connection and OAuth credential. A timed-out tool may already have run.',
			);
		}
		if (response.statusCode < 200 || response.statusCode >= 300) {
			const instructions: Record<number, string> = {
				401: 'Reconnect the DSers OAuth2 credential.',
				403: 'Check the authorized scopes, account permissions, and DSers plan.',
				404: 'The DSers MCP session or endpoint is unavailable. Run the workflow again.',
				429: 'The DSers request limit was reached. Wait before running again.',
			};
			throw new McpError(
				`DSers returned HTTP ${response.statusCode}. ${instructions[response.statusCode] ?? 'Try again later.'}`,
				response.statusCode,
			);
		}
		return response;
	}

	private async rpc(method: string, params: IDataObject = {}): Promise<IDataObject> {
		const id = ++this.requestId;
		const response = await this.post({ jsonrpc: '2.0', id, method, params });
		if (method === 'initialize') {
			this.sessionId = header(response.headers, 'mcp-session-id');
		}
		return parseEnvelope(
			response.body,
			header(response.headers, 'content-type') ?? '',
			id,
			this.node,
		);
	}

	async connect(): Promise<void> {
		if (this.connected) return;
		const result = await this.rpc('initialize', {
			protocolVersion: this.protocolVersion,
			capabilities: {},
			clientInfo: { name: 'dsers-n8n', version: '0.1.0' },
		});
		if (
			typeof result.protocolVersion !== 'string' ||
			!PROTOCOL_VERSIONS.includes(result.protocolVersion)
		) {
			throw new McpError('DSers negotiated an unsupported MCP protocol version. Update this node.');
		}
		this.protocolVersion = result.protocolVersion;
		this.connected = true;
		let initialized = false;
		try {
			await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
			initialized = true;
		} finally {
			this.connected = initialized;
		}
	}

	async listTools(): Promise<McpTool[]> {
		await this.connect();
		const tools: McpTool[] = [];
		const cursors = new Set<string>();
		let cursor: string | undefined;
		for (let page = 0; page < 100; page++) {
			const result = await this.rpc('tools/list', cursor === undefined ? {} : { cursor });
			if (!Array.isArray(result.tools)) throw new McpError('DSers returned an invalid tool list.');
			for (const tool of result.tools) {
				if (!isObject(tool) || typeof tool.name !== 'string' || !isObject(tool.inputSchema)) {
					throw new McpError('DSers returned an invalid tool definition.');
				}
				tools.push(tool as McpTool);
			}
			if (result.nextCursor === undefined || result.nextCursor === '') return tools;
			if (typeof result.nextCursor !== 'string' || cursors.has(result.nextCursor)) {
				throw new McpError('DSers returned an invalid or repeated tool-list cursor.');
			}
			cursor = result.nextCursor;
			cursors.add(cursor);
		}
		throw new McpError('DSers tool discovery exceeded the page limit.');
	}

	async callTool(name: string, args: IDataObject): Promise<IDataObject> {
		await this.connect();
		const result = await this.rpc('tools/call', { name, arguments: args });
		if (result.isError === true) {
			throw new McpError(toolFailureMessage(result));
		}
		return result;
	}
}
