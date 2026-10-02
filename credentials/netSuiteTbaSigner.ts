import { createHmac, randomBytes } from 'crypto';
import type {
	ICredentialDataDecryptedObject,
	IDataObject,
	IHttpRequestOptions,
} from 'n8n-workflow';

/**
 * OAuth 1.0 (HMAC-SHA256) signing for NetSuite token-based authentication.
 * Lives next to the credential so the bundle never imports NodeApiError.
 *
 * The signing steps follow the approach in n8n-nodes-netsuite-tba (MIT, Piotr Wawer).
 */

export interface SignOverrides {
	nonce?: string;
	timestamp?: string;
}

/** RFC 3986 percent-encoding, which also escapes ! * ( ) ' */
export function percentEncode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!*()']/g,
		(char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
	);
}

function collectQueryPairs(url: URL, qs?: IDataObject): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	url.searchParams.forEach((value, key) => pairs.push([key, value]));
	if (qs) {
		for (const [key, value] of Object.entries(qs)) {
			if (value === undefined || value === null) continue;
			if (Array.isArray(value)) {
				// axios serializes array params as key[]=a&key[]=b
				for (const item of value) pairs.push([key + '[]', String(item)]);
			} else if (typeof value === 'object') {
				pairs.push([key, JSON.stringify(value)]);
			} else {
				pairs.push([key, String(value)]);
			}
		}
	}
	return pairs;
}

export function buildOAuthHeader(
	method: string,
	url: URL,
	credentials: ICredentialDataDecryptedObject,
	qs?: IDataObject,
	overrides: SignOverrides = {},
): string {
	const realm = String(credentials.realm ?? '').trim();
	const consumerKey = String(credentials.consumerKey ?? '').trim();
	const consumerSecret = String(credentials.consumerSecret ?? '').trim();
	const tokenId = String(credentials.tokenId ?? '').trim();
	const tokenSecret = String(credentials.tokenSecret ?? '').trim();
	if (!realm || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
		throw new Error(
			'NetSuite TBA credential is missing Account ID, Consumer Key/Secret or Token ID/Secret',
		);
	}

	const oauthParams: Record<string, string> = {
		oauth_consumer_key: consumerKey,
		oauth_token: tokenId,
		oauth_nonce: overrides.nonce ?? randomBytes(16).toString('hex'),
		oauth_timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000).toString(),
		oauth_signature_method: 'HMAC-SHA256',
		oauth_version: '1.0',
	};

	const encodedPairs: Array<[string, string]> = [
		...collectQueryPairs(url, qs),
		...Object.entries(oauthParams),
	].map(([key, value]) => [percentEncode(key), percentEncode(value)]);
	encodedPairs.sort((a, b) =>
		a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1,
	);

	const paramString = encodedPairs.map(([key, value]) => `${key}=${value}`).join('&');
	const baseString = [
		percentEncode(method.toUpperCase()),
		percentEncode(url.origin + url.pathname),
		percentEncode(paramString),
	].join('&');
	const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
	const signature = createHmac('sha256', signingKey).update(baseString).digest('base64');

	const headerParams: Array<[string, string]> = [
		['realm', realm],
		...Object.entries(oauthParams),
		['oauth_signature', signature],
	];
	return (
		'OAuth ' +
		headerParams.map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`).join(', ')
	);
}

/**
 * Signs an n8n HTTP request. Query-string params in the URL and in requestOptions.qs are both signed.
 * JSON and raw bodies are not part of an OAuth 1.0 signature, so they need no handling here.
 */
export function signRequest(
	credentials: ICredentialDataDecryptedObject,
	requestOptions: IHttpRequestOptions,
	overrides: SignOverrides = {},
): IHttpRequestOptions {
	const method = String(requestOptions.method ?? 'GET').toUpperCase();
	let url: URL;
	try {
		url = new URL(
			String(requestOptions.url ?? ''),
			requestOptions.baseURL ? String(requestOptions.baseURL) : undefined,
		);
	} catch {
		throw new Error(
			'NetSuite TBA: the request URL must be absolute, or the request needs a base URL',
		);
	}
	const authorization = buildOAuthHeader(
		method,
		url,
		credentials,
		requestOptions.qs as IDataObject | undefined,
		overrides,
	);
	requestOptions.headers = { ...(requestOptions.headers ?? {}), Authorization: authorization };
	return requestOptions;
}
