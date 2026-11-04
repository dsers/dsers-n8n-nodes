import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

import { CREDENTIAL_TYPE, MCP_ENDPOINT, McpClient } from './McpClient';
import type { McpHttpResponse } from './McpClient';

export function createClient(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	timeout: number,
): McpClient {
	return new McpClient(async (body, headers) => {
		const response: McpHttpResponse = await context.helpers.httpRequestWithAuthentication.call(
			context,
			CREDENTIAL_TYPE,
			{
				url: MCP_ENDPOINT,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				json: false,
				encoding: 'text',
				returnFullResponse: true,
				// Keep 401 visible to n8n's OAuth helper so it can refresh once.
				ignoreHttpStatusErrors: { ignore: true, except: [401] },
				disableFollowRedirect: true,
				timeout,
			},
			{ oauth2: { includeCredentialsOnRefreshOnBody: true } },
		);
		return response;
	}, context.getNode());
}
