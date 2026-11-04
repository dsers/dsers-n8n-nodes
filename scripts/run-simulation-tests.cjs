const { spawn } = require('node:child_process');
const net = require('node:net');
const assert = require('node:assert/strict');

async function main() {
	const port = await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const selected = server.address().port;
			server.close(() => resolve(selected));
		});
	});
	const mock = spawn(
		'postman',
		[
			'simulation',
			'run',
			'postman/simulations/dsers-mcp.sim.yaml',
			'--port',
			String(port),
			'--no-history',
			'--output',
			'ndjson',
		],
		{ stdio: ['ignore', 'pipe', 'pipe'] },
	);
	let log = '';
	let spawnError;
	let testsStarted = false;
	const stopped = new Promise((resolve) => {
		mock.once('error', (error) => {
			spawnError = error;
			resolve();
		});
		mock.once('close', resolve);
	});
	mock.stdout.on('data', (data) => {
		log += data.toString();
	});
	mock.stderr.on('data', (data) => process.stderr.write(data));
	try {
		await new Promise((resolve, reject) => {
			const finish = (error) => {
				clearInterval(poll);
				clearTimeout(timer);
				if (error) reject(error);
				else resolve();
			};
			const timer = setTimeout(
				() => finish(new Error('Postman simulation did not start within 30 seconds.')),
				30000,
			);
			const poll = setInterval(() => {
				if (spawnError) finish(spawnError);
				else if (log.includes('"listening"')) finish();
				else if (mock.exitCode !== null || mock.signalCode !== null)
					finish(new Error(`Postman exited: ${log}`));
			}, 100);
		});
		testsStarted = true;
		const code = await new Promise((resolve, reject) => {
			const test = spawn(process.execPath, ['--test', 'tests/http.sim.cjs'], {
				stdio: 'inherit',
				env: { ...process.env, DSERS_TEST_MCP_URL: `http://127.0.0.1:${port}/dsers/mcp` },
			});
			test.once('error', reject);
			test.once('exit', resolve);
		});
		assert.equal(code, 0, 'The node failed its HTTP simulation tests.');
	} finally {
		if (mock.pid && mock.exitCode === null && mock.signalCode === null) mock.kill('SIGINT');
		const killTimer = setTimeout(() => mock.kill('SIGKILL'), 5000);
		await stopped;
		clearTimeout(killTimer);
		if (testsStarted) {
			const count = log.split('\n').filter((line) => {
				try {
					const event = JSON.parse(line);
					return event.type === 'request' || event.event === 'request';
				} catch {
					return false;
				}
			}).length;
			console.log(`Postman simulation observed ${count} request events.`);
			assert.ok(count > 0, 'No dependency requests were observed in the simulation log.');
		}
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
