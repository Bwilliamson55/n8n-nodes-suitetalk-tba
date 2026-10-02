import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { signRequest } from './netSuiteTbaSigner';

export class NetSuiteTbaHttpApi implements ICredentialType {
	name = 'netSuiteTbaHttpApi';

	displayName = 'NetSuite TBA (HTTP Request) API';

	documentationUrl =
		'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_4247329078.html';

	properties: INodeProperties[] = [
		{
			displayName: 'Account ID (Realm)',
			name: 'realm',
			type: 'string',
			default: '',
			required: true,
			description:
				'NetSuite account ID, e.g. 1234567 (production), 1234567_SB1 (sandbox) or TSTDRV1234567. Used as the OAuth realm.',
		},
		{
			displayName: 'Consumer Key',
			name: 'consumerKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Consumer Secret',
			name: 'consumerSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Token ID',
			name: 'tokenId',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Token Secret',
			name: 'tokenSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	// Signs every request the HTTP Request node makes with this credential (OAuth 1.0, HMAC-SHA256).
	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		return signRequest(credentials, requestOptions);
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'=https://{{$credentials.realm.toLowerCase().replace("_", "-")}}.suitetalk.api.netsuite.com',
			url: '/services/rest/record/v1/metadata-catalog/customerMessage',
			method: 'GET',
		},
	};
}
