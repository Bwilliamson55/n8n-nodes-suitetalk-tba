# n8n-nodes-netsuite-tba-http

An n8n **credential** for NetSuite token-based authentication (TBA: OAuth 1.0, HMAC-SHA256) that the built-in **HTTP Request** node can use. There is no node in this package. Secrets stay in n8n's encrypted credential store, and the HTTP Request node keeps all of its own behavior: full response, never-error, response format, custom headers, retries.

## Use

1. Create a credential of type **NetSuite TBA (HTTP Request) API**. Fill in:
   - **Account ID (Realm)**: `1234567` for production, `1234567_SB1` for a sandbox.
   - Consumer Key and Consumer Secret (from the NetSuite integration record).
   - Token ID and Token Secret (from the access token).
   Use one credential per NetSuite account (production and sandbox are separate credentials).
2. In an **HTTP Request** node set **Authentication** to **Predefined Credential Type**, pick **NetSuite TBA (HTTP Request) API**, and choose your credential.
3. Use the full NetSuite URL, for example `https://1234567.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=100` (sandbox host: `1234567-sb1`).
   For SuiteQL also send the header `Prefer: transient` and a JSON body such as `{"q": "SELECT id FROM customer"}`.

The node signs each request with a fresh nonce and timestamp, including any query string, so retries and loops need no extra work.

## Notes

- The sandbox host uses a dash (`1234567-sb1`) but the realm uses an underscore (`1234567_SB1`).
- Signing covers the method, the URL and its query parameters. JSON and raw bodies are not part of an OAuth 1.0 signature. Form-encoded (`application/x-www-form-urlencoded`) bodies are **not** signed by this credential.
- The credential's **Test** button calls `GET /services/rest/record/v1/metadata-catalog/customerMessage`.
- Oracle has announced that no new TBA integrations for REST, SOAP or RESTlets can be created from NetSuite 2027.1. Existing TBA integrations keep working.

## Credits

Request-signing approach adapted from [n8n-nodes-netsuite-tba](https://www.npmjs.com/package/n8n-nodes-netsuite-tba) (MIT).

## License

MIT
