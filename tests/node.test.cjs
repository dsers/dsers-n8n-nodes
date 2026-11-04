const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Dsers } = require('../dist/nodes/Dsers/Dsers.node');

function context(parameters, { continueOnFail = false, reject = false } = {}) {
	const requests = [];
	return {
		requests,
		getInputData: () => parameters.map(() => ({ json: {} })),
		getNodeParameter: (name, i, fallback) => parameters[i][name] ?? fallback,
		continueOnFail: () => continueOnFail,
		getNode: () => ({
			id: 'test',
			name: 'DSers MCP',
			type: 'n8n-nodes-dsers.dsers',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		helpers: {
			async httpRequestWithAuthentication(type, options, extra) {
				assert.equal(type, 'dsersOAuth2Api');
				assert.equal(options.url, 'https://ai.dsers.com/mcp');
				assert.equal(options.disableFollowRedirect, true);
				assert.equal(extra.oauth2.includeCredentialsOnRefreshOnBody, true);
				assert.deepEqual(options.ignoreHttpStatusErrors, { ignore: true, except: [401] });
				const body = JSON.parse(options.body);
				requests.push(body);
				if (body.method === 'notifications/initialized')
					return { statusCode: 202, headers: {}, body: '' };
				let result;
				if (body.method === 'initialize') result = { protocolVersion: '2025-03-26' };
				else if (body.method === 'tools/list')
					result = {
						tools: [
							{ name: 'get_account_profile', inputSchema: { type: 'object' } },
							{ name: 'list_stores', inputSchema: { type: 'object' } },
						],
					};
				else
					result = reject
						? { isError: true }
						: {
								content: [{ type: 'text', text: JSON.stringify(body.params.arguments) }],
								isError: false,
							};
				return {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
				};
			},
		},
	};
}

test('node outputs each tool with pairing and observes list limit', async () => {
	const ctx = context([{ operation: 'getAll', returnAll: false, limit: 1 }]);
	const [items] = await new Dsers().execute.call(ctx);
	assert.equal(items.length, 1);
	assert.equal(items[0].json.name, 'get_account_profile');
	assert.deepEqual(items[0].pairedItem, { item: 0 });
});

test('schema lookup never invokes the tool', async () => {
	const ctx = context([{ operation: 'getSchema', toolName: 'list_stores' }]);
	const [[item]] = await new Dsers().execute.call(ctx);
	assert.equal(item.json.name, 'list_stores');
	assert.equal(
		ctx.requests.some((r) => r.method === 'tools/call'),
		false,
	);
});

test('each input resolves its own arguments and retains its pairing', async () => {
	const ctx = context([
		{ operation: 'execute', toolName: 'get_account_profile', arguments: '{"x":null}' },
		{ operation: 'execute', toolName: 'list_stores', arguments: { view: 'account_context' } },
	]);
	const [items] = await new Dsers().execute.call(ctx);
	assert.deepEqual(
		items.map((i) => i.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
	assert.deepEqual(
		ctx.requests.filter((r) => r.method === 'tools/call').map((r) => r.params),
		[
			{ name: 'get_account_profile', arguments: { x: null } },
			{ name: 'list_stores', arguments: { view: 'account_context' } },
		],
	);
});

test('invalid JSON or non-object arguments do not send requests', async () => {
	for (const args of ['{bad', 'null', '[]', 'true']) {
		const ctx = context([
			{ operation: 'execute', toolName: 'get_account_profile', arguments: args },
		]);
		await assert.rejects(new Dsers().execute.call(ctx), /Arguments must/);
		assert.equal(ctx.requests.length, 0);
	}
});

test('continue-on-fail preserves input pairing and continues to later inputs', async () => {
	const ctx = context(
		[
			{ operation: 'execute', toolName: 'get_account_profile', arguments: '[]' },
			{ operation: 'execute', toolName: 'get_account_profile', arguments: '{}' },
		],
		{ continueOnFail: true },
	);
	const [items] = await new Dsers().execute.call(ctx);
	assert.match(items[0].json.error, /JSON object/);
	assert.equal(items[1].json.isError, false);
	assert.deepEqual(
		items.map((i) => i.pairedItem.item),
		[0, 1],
	);
});

test('tool-level error fails the node despite HTTP success', async () => {
	const ctx = context(
		[{ operation: 'execute', toolName: 'get_account_profile', arguments: '{}' }],
		{ reject: true },
	);
	await assert.rejects(new Dsers().execute.call(ctx), /tool reported a failure/);
});

test('dynamic options discover tools without executing them', async () => {
	const ctx = context([{}]);
	const options = await new Dsers().methods.loadOptions.getTools.call(ctx);
	assert.deepEqual(
		options.map((o) => o.value),
		['get_account_profile', 'list_stores'],
	);
	assert.equal(
		ctx.requests.some((r) => r.method === 'tools/call'),
		false,
	);
});
