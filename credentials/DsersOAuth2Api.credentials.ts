import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class DsersOAuth2Api implements ICredentialType {
	name = 'dsersOAuth2Api';
	displayName = 'DSers OAuth2 API';
	icon: Icon = { light: 'file:../nodes/Dsers/dsers.png', dark: 'file:../nodes/Dsers/dsers.png' };
	extends = ['oAuth2Api'];
	documentationUrl = 'https://github.com/dsers/dsers-n8n-nodes#credentials';
	properties: INodeProperties[] = [
		{
			displayName: 'Use Dynamic Client Registration',
			name: 'useDynamicClientRegistration',
			type: 'hidden',
			default: true,
		},
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'hidden',
			default: 'https://ai.dsers.com/mcp',
		},
		{
			displayName: 'Resource URL',
			name: 'resourceUrl',
			type: 'hidden',
			default: 'https://ai.dsers.com/mcp',
		},
	];
}
