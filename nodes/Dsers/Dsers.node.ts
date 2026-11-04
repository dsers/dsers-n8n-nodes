import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { isObject } from './McpClient';
import { createClient } from './transport';

export class Dsers implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'DSers MCP',
		name: 'dsers',
		icon: { light: 'file:dsers.png', dark: 'file:dsers.png' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Discover and call DSers MCP tools for dropshipping workflows',
		defaults: { name: 'DSers MCP' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'dsersOAuth2Api', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'MCP Tool', value: 'tool' }],
				default: 'tool',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['tool'] } },
				options: [
					{
						name: 'Execute',
						value: 'execute',
						description: 'Call a DSers tool with its original JSON arguments',
						action: 'Execute an MCP tool',
					},
					{
						name: 'Get Schema',
						value: 'getSchema',
						description: 'Get a tool definition, including its input and output schemas',
						action: 'Get an MCP tool schema',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Discover available tools and their complete definitions',
						action: 'Get many MCP tools',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Tool Name or ID',
				name: 'toolName',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTools' },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['execute', 'getSchema'] } },
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Arguments (JSON)',
				name: 'arguments',
				type: 'json',
				typeOptions: { rows: 6 },
				default: '{}',
				required: true,
				displayOptions: { show: { operation: ['execute'] } },
				description:
					'The exact tool arguments. Use Get Schema to inspect required fields. Values are forwarded unchanged.',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: true,
				displayOptions: { show: { operation: ['getAll'] } },
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 1000 },
				default: 50,
				displayOptions: { show: { operation: ['getAll'], returnAll: [false] } },
				description: 'Max number of results to return',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						typeOptions: { minValue: 1000, maxValue: 300000 },
						default: 60000,
						description: 'Time in milliseconds to wait for each DSers request',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const tools = await createClient(this, 30000).listTools();
				return tools
					.map((tool) => ({ name: tool.title || tool.name, value: tool.name }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
				const timeout = Number(options.timeout ?? 60000);
				if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 300000) {
					throw new NodeOperationError(
						this.getNode(),
						'Timeout must be between 1000 and 300000 milliseconds.',
					);
				}
				const client = createClient(this, timeout);
				if (operation === 'getAll') {
					let tools = await client.listTools();
					if (!this.getNodeParameter('returnAll', itemIndex, true)) {
						const limit = Number(this.getNodeParameter('limit', itemIndex, 50));
						if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
							throw new NodeOperationError(
								this.getNode(),
								'Limit must be an integer between 1 and 1000.',
							);
						}
						tools = tools.slice(0, limit);
					}
					for (const tool of tools) output.push({ json: tool, pairedItem: { item: itemIndex } });
				} else if (operation === 'getSchema' || operation === 'execute') {
					const name = this.getNodeParameter('toolName', itemIndex) as string;
					if (typeof name !== 'string' || name.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'Select a DSers tool.');
					}
					if (operation === 'getSchema') {
						const tool = (await client.listTools()).find((entry) => entry.name === name);
						if (!tool)
							throw new NodeOperationError(
								this.getNode(),
								'The selected tool is not available to this account.',
							);
						output.push({ json: tool, pairedItem: { item: itemIndex } });
					} else {
						const raw = this.getNodeParameter('arguments', itemIndex, '{}');
						let args: unknown;
						try {
							args = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
						} catch {
							throw new NodeOperationError(this.getNode(), 'Arguments must contain valid JSON.');
						}
						if (!isObject(args))
							throw new NodeOperationError(this.getNode(), 'Arguments must be a JSON object.');
						const result = await client.callTool(name, args);
						output.push({ json: result, pairedItem: { item: itemIndex } });
					}
				} else {
					throw new NodeOperationError(this.getNode(), 'Unsupported DSers operation.');
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'The DSers request failed.';
				if (this.continueOnFail()) {
					output.push({ json: { error: message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}
		return [output];
	}
}
