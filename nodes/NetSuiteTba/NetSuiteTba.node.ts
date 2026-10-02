import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	CREDENTIAL_NAME,
	netSuiteError,
	netSuiteRequest,
	type ResponseFormat,
} from './GenericFunctions';

interface NameValue {
	name?: string;
	value?: string;
}

function pairsToObject(pairs: NameValue[]): IDataObject {
	const result: IDataObject = {};
	for (const pair of pairs) {
		if (pair.name) result[pair.name] = pair.value ?? '';
	}
	return result;
}

function withoutLinks(row: IDataObject): IDataObject {
	const { links: _links, ...rest } = row;
	return rest;
}

export class NetSuiteTba implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NetSuite (TBA)',
		name: 'netSuiteTba',
		icon: 'file:netsuiteTba.svg',
		group: ['transform'],
		version: 1,
		subtitle:
			'={{$parameter["operation"] === "suiteql" ? "SuiteQL query" : $parameter["method"] + " " + $parameter["url"]}}',
		description:
			'Run SuiteQL and call NetSuite REST Web Services using token-based authentication (TBA)',
		defaults: { name: 'NetSuite (TBA)' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: CREDENTIAL_NAME, required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Custom Request',
						value: 'customRequest',
						description:
							'Call any NetSuite REST endpoint, like the HTTP Request node but signed for you',
						action: 'Send a custom request',
					},
					{
						name: 'SuiteQL Query',
						value: 'suiteql',
						description: 'Run a SuiteQL SELECT statement',
						action: 'Run a suite QL query',
					},
				],
				default: 'suiteql',
			},

			// ---------------------------------------------------------------- SuiteQL
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				typeOptions: { rows: 6 },
				required: true,
				default: '',
				placeholder: "SELECT id, tranid FROM transaction WHERE type = 'SalesOrd'",
				description: 'The SuiteQL SELECT statement to run',
				displayOptions: { show: { operation: ['suiteql'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { operation: ['suiteql'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { operation: ['suiteql'], returnAll: [false] } },
			},
			{
				displayName: 'Options',
				name: 'suiteqlOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['suiteql'] } },
				options: [
					{
						displayName: 'Include Links',
						name: 'includeLinks',
						type: 'boolean',
						default: false,
						description: 'Whether to keep the empty "links" list NetSuite adds to every row',
					},
					{
						displayName: 'Max Rows',
						name: 'maxRows',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'Stop after this many rows when returning all results. 0 means no cap.',
					},
					{
						displayName: 'One Item per Row',
						name: 'oneItemPerRow',
						type: 'boolean',
						default: true,
						description:
							'Whether to return one item per row. Turn off to get a single item with an "items" list, which also keeps the workflow going when a query returns no rows.',
					},
					{
						displayName: 'Skip',
						name: 'offset',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'Number of rows to skip before the first one returned',
					},
				],
			},

			// ---------------------------------------------------------- Custom request
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'HEAD', value: 'HEAD' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				default: 'GET',
				description: 'The HTTP method to use',
				displayOptions: { show: { operation: ['customRequest'] } },
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'record/v1/customer/123',
				description:
					'A full https URL, or a path relative to https://&lt;account&gt;.suitetalk.api.netsuite.com/services/rest/. Query parameters in the URL are signed too.',
				displayOptions: { show: { operation: ['customRequest'] } },
			},
			{
				displayName: 'Send Query Parameters',
				name: 'sendQuery',
				type: 'boolean',
				default: false,
				description: 'Whether the request has query parameters',
				displayOptions: { show: { operation: ['customRequest'] } },
			},
			{
				displayName: 'Query Parameters',
				name: 'queryParameters',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add parameter',
				default: { parameters: [{ name: '', value: '' }] },
				displayOptions: { show: { operation: ['customRequest'], sendQuery: [true] } },
				options: [
					{
						name: 'parameters',
						displayName: 'Parameter',
						values: [
							{ displayName: 'Name', name: 'name', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Send Headers',
				name: 'sendHeaders',
				type: 'boolean',
				default: false,
				description: 'Whether the request has headers (Authorization is added for you)',
				displayOptions: { show: { operation: ['customRequest'] } },
			},
			{
				displayName: 'Headers',
				name: 'headerParameters',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add header',
				default: { parameters: [{ name: '', value: '' }] },
				displayOptions: { show: { operation: ['customRequest'], sendHeaders: [true] } },
				options: [
					{
						name: 'parameters',
						displayName: 'Header',
						values: [
							{ displayName: 'Name', name: 'name', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Send Body',
				name: 'sendBody',
				type: 'boolean',
				default: false,
				description: 'Whether the request has a body',
				displayOptions: {
					show: { operation: ['customRequest'], method: ['DELETE', 'PATCH', 'POST', 'PUT'] },
				},
			},
			{
				displayName: 'Body Content Type',
				name: 'bodyContentType',
				type: 'options',
				options: [
					{ name: 'JSON', value: 'json' },
					{ name: 'Raw', value: 'raw' },
				],
				default: 'json',
				displayOptions: {
					show: {
						operation: ['customRequest'],
						method: ['DELETE', 'PATCH', 'POST', 'PUT'],
						sendBody: [true],
					},
				},
			},
			{
				displayName: 'JSON Body',
				name: 'jsonBody',
				type: 'json',
				default: '',
				displayOptions: {
					show: {
						operation: ['customRequest'],
						method: ['DELETE', 'PATCH', 'POST', 'PUT'],
						sendBody: [true],
						bodyContentType: ['json'],
					},
				},
			},
			{
				displayName: 'Raw Body',
				name: 'rawBody',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				displayOptions: {
					show: {
						operation: ['customRequest'],
						method: ['DELETE', 'PATCH', 'POST', 'PUT'],
						sendBody: [true],
						bodyContentType: ['raw'],
					},
				},
			},
			{
				displayName: 'Raw Content Type',
				name: 'rawContentType',
				type: 'string',
				default: 'text/plain',
				displayOptions: {
					show: {
						operation: ['customRequest'],
						method: ['DELETE', 'PATCH', 'POST', 'PUT'],
						sendBody: [true],
						bodyContentType: ['raw'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'requestOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['customRequest'] } },
				options: [
					{
						displayName: 'Include Response Headers and Status',
						name: 'fullResponse',
						type: 'boolean',
						default: false,
						description:
							'Whether to return the HTTP status code, status message and headers together with the body',
					},
					{
						displayName: 'Never Error',
						name: 'neverError',
						type: 'boolean',
						default: false,
						description:
							'Whether to succeed even when NetSuite returns an error status (4xx or 5xx). Turn on "Include Response Headers and Status" to see which status came back.',
					},
					{
						displayName: 'Prefer: Transient Header',
						name: 'preferTransient',
						type: 'boolean',
						default: false,
						description: 'Whether to send the "Prefer: transient" header that SuiteQL needs',
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						options: [
							{ name: 'Autodetect', value: 'autodetect' },
							{ name: 'JSON', value: 'json' },
							{ name: 'Text', value: 'text' },
						],
						default: 'autodetect',
						description: 'How to read the response body',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'Request timeout in milliseconds. 0 uses the n8n default.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const result =
					operation === 'suiteql'
						? await runSuiteQl.call(this, i)
						: await runCustomRequest.call(this, i);
				returnData.push(...result);
			} catch (error) {
				if (this.continueOnFail()) {
					const failure: IDataObject = { error: (error as Error).message };
					if (error instanceof NodeApiError) {
						failure.httpCode = error.httpCode;
						failure.description = error.description;
					}
					returnData.push({ json: failure, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError || error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

async function runSuiteQl(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const query = (this.getNodeParameter('query', i) as string).trim();
	if (!query)
		throw new NodeOperationError(this.getNode(), 'The SuiteQL query is empty', { itemIndex: i });

	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	// NetSuite returns at most 1000 rows per page.
	const limit = returnAll ? 1000 : Math.min(this.getNodeParameter('limit', i, 50) as number, 1000);
	const options = this.getNodeParameter('suiteqlOptions', i, {}) as IDataObject;
	const includeLinks = options.includeLinks === true;
	const oneItemPerRow = options.oneItemPerRow !== false;
	const maxRows = Number(options.maxRows ?? 0);
	let offset = Number(options.offset ?? 0);

	const rows: IDataObject[] = [];
	let hasMore = false;
	for (;;) {
		const response = await netSuiteRequest.call(this, {
			method: 'POST',
			target: 'query/v1/suiteql',
			qs: { limit, offset },
			jsonBody: { q: query },
			preferTransient: true,
			responseFormat: 'json',
		});
		if (response.statusCode >= 400) throw netSuiteError(this, response, i);

		const body = (
			response.body && typeof response.body === 'object' ? response.body : {}
		) as IDataObject;
		const page = Array.isArray(body.items) ? (body.items as IDataObject[]) : [];
		rows.push(...page);
		hasMore = body.hasMore === true;
		offset += page.length;

		if (maxRows > 0 && rows.length >= maxRows) {
			hasMore = hasMore || rows.length > maxRows;
			rows.length = maxRows;
			break;
		}
		if (!returnAll || !hasMore || page.length === 0) break;
	}

	const cleaned = includeLinks ? rows : rows.map(withoutLinks);
	if (oneItemPerRow) {
		return cleaned.map((row) => ({ json: row, pairedItem: { item: i } }));
	}
	return [{ json: { items: cleaned, count: cleaned.length, hasMore }, pairedItem: { item: i } }];
}

async function runCustomRequest(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const method = this.getNodeParameter('method', i) as IHttpRequestMethods;
	const target = (this.getNodeParameter('url', i) as string).trim();
	if (!target) throw new NodeOperationError(this.getNode(), 'The URL is empty', { itemIndex: i });

	const sendQuery = this.getNodeParameter('sendQuery', i, false) as boolean;
	const sendHeaders = this.getNodeParameter('sendHeaders', i, false) as boolean;
	const sendBody = this.getNodeParameter('sendBody', i, false) as boolean;
	const options = this.getNodeParameter('requestOptions', i, {}) as IDataObject;

	const qs = sendQuery
		? pairsToObject(this.getNodeParameter('queryParameters.parameters', i, []) as NameValue[])
		: {};
	const headers = sendHeaders
		? pairsToObject(this.getNodeParameter('headerParameters.parameters', i, []) as NameValue[])
		: {};

	let jsonBody: unknown;
	let rawBody: string | undefined;
	let rawContentType: string | undefined;
	if (sendBody) {
		if ((this.getNodeParameter('bodyContentType', i, 'json') as string) === 'raw') {
			rawBody = this.getNodeParameter('rawBody', i, '') as string;
			rawContentType = this.getNodeParameter('rawContentType', i, 'text/plain') as string;
		} else {
			const value = this.getNodeParameter('jsonBody', i, '') as unknown;
			if (typeof value === 'string') {
				if (value.trim() !== '') {
					try {
						jsonBody = JSON.parse(value);
					} catch {
						throw new NodeOperationError(this.getNode(), 'The JSON body is not valid JSON', {
							itemIndex: i,
						});
					}
				}
			} else {
				jsonBody = value;
			}
		}
	}

	const response = await netSuiteRequest.call(this, {
		method,
		target,
		qs,
		headers,
		jsonBody,
		rawBody,
		rawContentType,
		preferTransient: options.preferTransient === true,
		responseFormat: (options.responseFormat as ResponseFormat | undefined) ?? 'autodetect',
		timeout: Number(options.timeout ?? 0),
	});

	if (response.statusCode >= 400 && options.neverError !== true) {
		throw netSuiteError(this, response, i);
	}

	if (options.fullResponse === true) {
		return [
			{
				json: {
					statusCode: response.statusCode,
					statusMessage: response.statusMessage,
					headers: response.headers,
					body: response.body as IDataObject,
				},
				pairedItem: { item: i },
			},
		];
	}

	const body = response.body;
	if (Array.isArray(body)) {
		return body.map((entry) => ({
			json: (entry && typeof entry === 'object' ? entry : { data: entry }) as IDataObject,
			pairedItem: { item: i },
		}));
	}
	if (body && typeof body === 'object')
		return [{ json: body as IDataObject, pairedItem: { item: i } }];
	if (body === '' || body === undefined) return [{ json: {}, pairedItem: { item: i } }];
	return [{ json: { data: body as string }, pairedItem: { item: i } }];
}
