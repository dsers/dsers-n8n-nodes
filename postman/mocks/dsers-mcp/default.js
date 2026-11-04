const http = require('node:http');

http.createServer(async (req, res) => {
	if (req.url !== '/mcp' || req.method !== 'POST') {
		res.writeHead(501).end('Endpoint not modeled');
		return;
	}
	let body = req.body;
	if (!body) {
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		body = JSON.parse(Buffer.concat(chunks).toString());
	} else if (typeof body === 'string') {
		body = JSON.parse(body);
	}
	const json = (result) => {
		res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'synthetic-session' });
		res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
	};
	if (body.method === 'initialize') {
		json({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'synthetic-dsers', version: '1' } });
		return;
	}
	if (req.headers['mcp-session-id'] !== 'synthetic-session' || req.headers['mcp-protocol-version'] !== '2025-03-26') {
		res.writeHead(400).end('Missing negotiated headers');
		return;
	}
	if (body.method === 'notifications/initialized') {
		res.writeHead(202).end();
		return;
	}
	if (req.headers['x-test-http-status']) {
		res.writeHead(Number(req.headers['x-test-http-status']), { 'content-type': 'text/html' }).end('<html>Synthetic gateway failure</html>');
		return;
	}
	if (body.method === 'tools/list') {
		const tool = (name) => ({ name, inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } });
		json(body.params.cursor
			? { tools: [tool('list_stores')] }
			: { tools: [tool('get_account_profile')], nextCursor: 'synthetic-page-2' });
		return;
	}
	if (body.method === 'tools/call') {
		if (req.headers['x-test-delay']) await new Promise((resolve) => setTimeout(resolve, 1500));
		const result = {
			content: [{ type: 'text', text: JSON.stringify({ fixture: true, received: body.params.arguments }) }],
			structuredContent: { fixture: true, tool: body.params.name, received: body.params.arguments },
			isError: req.headers['x-test-tool-error'] === 'true',
		};
		if (req.headers['x-test-sse'] === 'true') {
			res.writeHead(200, { 'content-type': 'text/event-stream' });
			res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`);
		} else json(result);
		return;
	}
	res.writeHead(501).end('MCP method not modeled');
}).listen(process.env.PORT);
