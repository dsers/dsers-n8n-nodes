const { test } = require('node:test');
const assert = require('node:assert/strict');
const { McpClient } = require('../dist/nodes/Dsers/McpClient');

const NODE = {
	id: 'test',
	name: 'DSers MCP',
	type: 'n8n-nodes-dsers.dsers',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const definition = {
	name: 'fixture_tool',
	inputSchema: { type: 'object', properties: { empty: { type: ['string', 'null'] } } },
	outputSchema: { type: 'object' },
	annotations: { readOnlyHint: true },
};
const ok = (body, result, headers = {}) => ({
	statusCode: 200,
	headers: { 'content-type': 'application/json', ...headers },
	body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
});

function fixture(onRequest) {
	const calls = [];
	const client = new McpClient(async (body, headers) => {
		calls.push({ body, headers });
		if (body.method === 'initialize') {
			assert.equal(body.params.protocolVersion, '2025-03-26');
			return ok(
				body,
				{ protocolVersion: '2025-03-26', capabilities: { tools: {} } },
				{
					'Mcp-Session-Id': 'synthetic-session',
				},
			);
		}
		assert.equal(headers['Mcp-Session-Id'], 'synthetic-session');
		assert.equal(headers['MCP-Protocol-Version'], '2025-03-26');
		if (body.method === 'notifications/initialized') {
			assert.equal(body.id, undefined);
			return { statusCode: 202, headers: {}, body: '' };
		}
		return onRequest(body, headers, calls);
	}, NODE);
	return { client, calls };
}

test('handshake precedes discovery; paginated definitions remain unchanged', async () => {
	const { client, calls } = fixture((body) => {
		if (!body.params.cursor) return ok(body, { tools: [definition], nextCursor: 'page-2' });
		assert.equal(body.params.cursor, 'page-2');
		return ok(body, { tools: [{ ...definition, name: 'second' }] });
	});
	assert.deepEqual(await client.listTools(), [definition, { ...definition, name: 'second' }]);
	assert.deepEqual(
		calls.map((c) => c.body.method),
		['initialize', 'notifications/initialized', 'tools/list', 'tools/list'],
	);
});

test('SSE response IDs are matched after notification events and multiline data', async () => {
	const { client } = fixture((body) => ({
		statusCode: 200,
		headers: { 'content-type': 'text/event-stream; charset=utf-8' },
		body: `: heartbeat\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0",\r\ndata: "id":${body.id},"result":{"tools":[${JSON.stringify(definition)}]}}\r\n\r\n`,
	}));
	assert.deepEqual(await client.listTools(), [definition]);
});

test('call forwards nested arguments, null, false, zero, arrays, and empty values exactly', async () => {
	const args = { empty: null, enabled: false, zero: 0, nested: { list: ['', null, { value: 1 }] } };
	const result = {
		content: [{ type: 'text', text: '{"ok":true}' }],
		structuredContent: { count: 0 },
		_meta: { extra: true },
		isError: false,
	};
	const { client, calls } = fixture((body) => {
		assert.deepEqual(body.params, { name: 'fixture_tool', arguments: args });
		return ok(body, result);
	});
	assert.deepEqual(await client.callTool('fixture_tool', args), result);
	assert.equal(calls.filter((c) => c.body.method === 'tools/call').length, 1);
});

for (const status of [401, 403, 404, 429, 500, 503]) {
	test(`HTTP ${status} fails once without leaking the server body`, async () => {
		const { client, calls } = fixture(() => ({
			statusCode: status,
			headers: {},
			body: 'synthetic-secret-do-not-echo',
		}));
		await assert.rejects(client.callTool('fixture_tool', {}), (error) => {
			assert.equal(error.statusCode, status);
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.doesNotMatch(error.message, /synthetic-secret/);
			return true;
		});
		assert.equal(calls.filter((c) => c.body.method === 'tools/call').length, 1);
	});
}

test('HTTP 200 with isError fails the workflow and does not retry', async () => {
	const { client, calls } = fixture((body) =>
		ok(body, { isError: true, content: [{ type: 'text', text: 'Denied' }] }),
	);
	await assert.rejects(client.callTool('fixture_tool', {}), /tool reported a failure/);
	assert.equal(calls.filter((c) => c.body.method === 'tools/call').length, 1);
});

test('JSON-RPC error, wrong response ID, malformed data, and repeated cursor are rejected', async (t) => {
	for (const [label, response, pattern] of [
		[
			'RPC error',
			(b) => ({
				statusCode: 200,
				headers: {},
				body: { jsonrpc: '2.0', id: b.id, error: { code: -32602, message: 'private' } },
			}),
			/-32602/,
		],
		[
			'Wrong ID',
			() => ({ statusCode: 200, headers: {}, body: { jsonrpc: '2.0', id: 999, result: {} } }),
			/matching/,
		],
		[
			'Malformed JSON',
			() => ({ statusCode: 200, headers: {}, body: '<html>bad</html>' }),
			/invalid MCP response/,
		],
		['Invalid tool', (b) => ok(b, { tools: [{ name: 'bad' }] }), /invalid tool definition/],
		['Repeated cursor', (b) => ok(b, { tools: [], nextCursor: 'same' }), /repeated/],
	]) {
		await t.test(label, async () => {
			await assert.rejects(fixture(response).client.listTools(), pattern);
		});
	}
});

test('unsupported protocol never reaches a tool call', async () => {
	const calls = [];
	const client = new McpClient(async (body) => {
		calls.push(body.method);
		return ok(body, { protocolVersion: '2099-01-01' });
	}, NODE);
	await assert.rejects(client.callTool('fixture_tool', {}), /unsupported MCP protocol/);
	assert.deepEqual(calls, ['initialize']);
});

test('network failures do not expose credential-bearing error objects', async () => {
	const client = new McpClient(async () => {
		throw new Error('Authorization: synthetic-secret');
	}, NODE);
	await assert.rejects(client.listTools(), (error) => {
		assert.match(error.message, /Could not complete the DSers request/);
		assert.doesNotMatch(error.message, /synthetic-secret/);
		return true;
	});
});

for (const [code, reason, pattern] of [
	['VALIDATION_ERROR', 'PLAN_RECORD_NOTFOUND', /no subscription record.*PLAN_RECORD_NOTFOUND/],
	['INSUFFICIENT_SCOPE', undefined, /additional OAuth permissions/],
	['PLAN_RESTRICTION', undefined, /subscription or Credits entitlement/],
	['VALIDATION_ERROR', 'UNRECOGNIZED_REASON', /tool reported a failure/],
	['UNKNOWN_CODE', 'PLAN_RECORD_NOTFOUND', /tool reported a failure/],
]) {
	test(`structured business error ${code}/${reason} provides safe recovery without retry`, async () => {
		const { client, calls } = fixture((body) =>
			ok(body, {
				isError: true,
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							code,
							reason,
							message: 'Authorization: synthetic-secret',
							hint: 'https://example.invalid/?token=synthetic-secret',
						}),
					},
				],
			}),
		);
		await assert.rejects(client.callTool('fixture_tool', {}), (error) => {
			assert.match(error.message, pattern);
			assert.doesNotMatch(error.message, /synthetic-secret|example.invalid/);
			return true;
		});
		assert.equal(calls.filter((call) => call.body.method === 'tools/call').length, 1);
	});
}
