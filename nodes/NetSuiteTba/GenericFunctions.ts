import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'netSuiteTbaApi';

export type ResponseFormat = 'autodetect' | 'json' | 'text';

export interface NetSuiteResponse {
	statusCode: number;
	statusMessage: string;
	headers: IDataObject;
	body: unknown;
}

export interface NetSuiteRequest {
	method: IHttpRequestMethods;
	/** Full https URL, or a path relative to /services/rest/ on the account's SuiteTalk host. */
	target: string;
	qs?: IDataObject;
	headers?: IDataObject;
	jsonBody?: unknown;
	rawBody?: string;
	rawContentType?: string;
	responseFormat?: ResponseFormat;
	preferTransient?: boolean;
	timeout?: number;
}

/** 1234567_SB1 -> 1234567-sb1 (the NetSuite host name form). */
export function accountHost(realm: string): string {
	return realm.trim().toLowerCase().replace(/_/g, '-');
}

export function resolveUrl(realm: string, target: string): string {
	const value = target.trim();
	if (/^https?:\/\//i.test(value)) return value;
	const path = value.replace(/^\/+/, '').replace(/^services\/rest\/+/i, '');
	return `https://${accountHost(realm)}.suitetalk.api.netsuite.com/services/rest/${path}`;
}

function hasHeader(headers: IDataObject, name: string): boolean {
	const wanted = name.toLowerCase();
	return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
}

export function parseBody(raw: unknown, headers: IDataObject, format: ResponseFormat): unknown {
	if (raw === undefined || raw === null) return '';
	if (typeof raw !== 'string') return raw;
	if (format === 'text' || raw.trim() === '') return raw;
	const contentType = String(headers['content-type'] ?? '').toLowerCase();
	if (format !== 'json' && !contentType.includes('json')) return raw;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/**
 * Sends one request through the NetSuite TBA credential (signed by the credential's authenticate()).
 * HTTP error statuses are returned, not thrown, so the caller decides what to do with them.
 */
export async function netSuiteRequest(
	this: IExecuteFunctions,
	spec: NetSuiteRequest,
): Promise<NetSuiteResponse> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const realm = String(credentials.realm ?? '');
	if (!realm.trim()) {
		throw new NodeOperationError(this.getNode(), 'The NetSuite TBA credential has no Account ID');
	}

	const headers: IDataObject = { Accept: 'application/json', ...(spec.headers ?? {}) };
	if (spec.preferTransient) headers.Prefer = 'transient';

	const options: IHttpRequestOptions = {
		method: spec.method,
		url: resolveUrl(realm, spec.target),
		headers,
		encoding: 'text',
		json: false,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (spec.qs && Object.keys(spec.qs).length > 0) options.qs = spec.qs;
	if (spec.timeout && spec.timeout > 0) options.timeout = spec.timeout;

	if (spec.rawBody !== undefined) {
		options.body = spec.rawBody;
		if (!hasHeader(headers, 'content-type')) {
			headers['Content-Type'] = spec.rawContentType || 'text/plain';
		}
	} else if (spec.jsonBody !== undefined) {
		options.body =
			typeof spec.jsonBody === 'string' ? spec.jsonBody : JSON.stringify(spec.jsonBody);
		if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
	}

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL_NAME,
		options,
	)) as { body?: unknown; headers?: IDataObject; statusCode?: number; statusMessage?: string };

	const responseHeaders = (response.headers ?? {}) as IDataObject;
	return {
		statusCode: Number(response.statusCode ?? 0),
		statusMessage: String(response.statusMessage ?? ''),
		headers: responseHeaders,
		body: parseBody(response.body, responseHeaders, spec.responseFormat ?? 'autodetect'),
	};
}

/** Builds a readable error from a NetSuite error response (o:errorDetails when present). */
export function netSuiteError(
	context: IExecuteFunctions,
	response: NetSuiteResponse,
	itemIndex: number,
): NodeApiError {
	const body = response.body;
	const object =
		body && typeof body === 'object' && !Array.isArray(body) ? (body as IDataObject) : undefined;

	const rawDetails = object?.['o:errorDetails'];
	const details = Array.isArray(rawDetails)
		? (rawDetails as IDataObject[])
				.map((entry) => [entry['o:errorCode'], entry.detail].filter(Boolean).join(': '))
				.filter(Boolean)
				.join('; ')
		: '';

	const title = object?.title ? String(object.title) : response.statusMessage;
	const message = `NetSuite returned ${response.statusCode}${title ? ` (${title})` : ''}`;

	let hint = '';
	if (response.statusCode === 401 || response.statusCode === 403) {
		hint =
			' Check the Account ID (sandboxes use the _SB1 form), the consumer and token keys, and that the token role has REST Web Services permission.';
	} else if (response.statusCode === 429) {
		hint =
			' NetSuite concurrency limit reached. Retry later or lower the number of parallel calls.';
	}

	const fallback =
		typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body ?? '').slice(0, 500);
	const description = `${details || fallback}${hint}`;

	return new NodeApiError(
		context.getNode(),
		{ statusCode: response.statusCode, body: (object ?? String(body ?? '')) as JsonObject },
		{ message, description, httpCode: String(response.statusCode), itemIndex },
	);
}
