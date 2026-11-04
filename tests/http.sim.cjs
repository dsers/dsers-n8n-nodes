const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Dsers } = require('../dist/nodes/Dsers/Dsers.node');

function context(params, testHeaders = {}) {
	const calls = [];
	return {
		calls,
		getInputData: () => [{ json: {} }],
		getNodeParameter: (key, _index, fallback) => params[key] ?? fallback,
		getNode: () => ({
			id: 'test-http',
			name: 'DSers MCP',
			type: 'n8n-nodes-dsers.dsers',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		continueOnFail: () => false,
		helpers: {
			async httpRequestWithAuthentication(type, options) {
				assert.equal(type, 'dsersOAuth2Api');
				assert.equal(options.url, 'https://ai.dsers.com/mcp');
				assert.equal(options.method, 'POST');
				calls.push(JSON.parse(options.body).method);
				// Only the test adapter redirects traffic. The shipped node has no test endpoint option.
				const response = await fetch(process.env.DSERS_TEST_MCP_URL, {
					method: options.method,
					headers: { ...options.headers, ...testHeaders },
					body: options.body,
					signal: AbortSignal.timeout(options.timeout),
					redirect: 'manual',
				});
				return {
					statusCode: response.status,
					headers: Object.fromEntries(response.headers),
					body: await response.text(),
				};
			},
		},
	};
}

test('HTTP simulation: node discovers all pages and outputs complete tool definitions', async () => {
	const ctx = context({ operation: 'getAll', returnAll: true });
	const [items] = await new Dsers().execute.call(ctx);
	assert.deepEqual(
		items.map((item) => item.json.name),
		['get_account_profile', 'list_stores'],
	);
	assert.deepEqual(ctx.calls, [
		'initialize',
		'notifications/initialized',
		'tools/list',
		'tools/list',
	]);
});

for (const sse of [false, true]) {
	test(`HTTP simulation: actual node call preserves arguments and ${sse ? 'SSE' : 'JSON'} result`, async () => {
		const args = { nested: { zero: 0, null: null, false: false, empty: [] } };
		const ctx = context(
			{ operation: 'execute', toolName: 'get_account_profile', arguments: args },
			{ 'x-test-sse': String(sse) },
		);
		const [[item]] = await new Dsers().execute.call(ctx);
		assert.deepEqual(item.json.structuredContent.received, args);
		assert.deepEqual(ctx.calls, ['initialize', 'notifications/initialized', 'tools/call']);
	});
}

for (const code of [401, 403, 429, 503]) {
	test(`HTTP simulation: HTTP ${code} fails without an application retry`, async () => {
		const ctx = context(
			{ operation: 'execute', toolName: 'get_account_profile', arguments: '{}' },
			{ 'x-test-http-status': String(code) },
		);
		await assert.rejects(new Dsers().execute.call(ctx), new RegExp(`HTTP ${code}`));
		assert.equal(ctx.calls.filter((method) => method === 'tools/call').length, 1);
	});
}

test('HTTP simulation: business failure at HTTP 200 fails execution', async () => {
	const ctx = context(
		{ operation: 'execute', toolName: 'get_account_profile', arguments: '{}' },
		{ 'x-test-tool-error': 'true' },
	);
	await assert.rejects(new Dsers().execute.call(ctx), /tool reported a failure/);
});

test('HTTP simulation: request timeout is bounded and not retried', async () => {
	const ctx = context(
		{
			operation: 'execute',
			toolName: 'get_account_profile',
			arguments: '{}',
			options: { timeout: 1000 },
		},
		{ 'x-test-delay': 'true' },
	);
	await assert.rejects(new Dsers().execute.call(ctx), /Could not complete the DSers request/);
	assert.equal(ctx.calls.filter((method) => method === 'tools/call').length, 1);
});

test('HTTP simulation: missing plan record gives actionable guidance without replay', async () => {
	const ctx = context(
		{ operation: 'execute', toolName: 'get_account_profile', arguments: '{}' },
		{ 'x-test-plan-record-missing': 'true' },
	);
	await assert.rejects(new Dsers().execute.call(ctx), (error) => {
		assert.match(error.message, /no subscription record.*PLAN_RECORD_NOTFOUND/);
		assert.doesNotMatch(error.message, /private upstream message/);
		return true;
	});
	assert.equal(ctx.calls.filter((method) => method === 'tools/call').length, 1);
});
