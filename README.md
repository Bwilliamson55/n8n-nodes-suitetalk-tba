# n8n-nodes-suitetalk-tba

An n8n node and credential for **NetSuite SuiteTalk REST Web Services** with **token-based authentication** (TBA: OAuth 1.0, HMAC-SHA256). Secrets stay in n8n's encrypted credential store, every request is signed for you, and you get the real HTTP status and headers back when you ask for them.

## Node: NetSuite (TBA)

**SuiteQL Query**
- Type a `SELECT` statement. Rows come back as one item each, with NetSuite's empty `links` list removed.
- *Return All* pages through the results (1000 rows per page). *Limit* and *Skip* work for a single page.
- Turn off *One Item per Row* to get a single item `{ items, count, hasMore }`, which also keeps a workflow running when a query returns no rows.

**Custom Request**
- Works like the HTTP Request node, but signed for NetSuite. Pick a method and a URL: either a full `https://` URL or a path relative to `https://<account>.suitetalk.api.netsuite.com/services/rest/` (for example `record/v1/customer/123`).
- Query parameters, headers, and a JSON or raw body are supported. Anything in the URL's query string is signed too.
- Options: *Include Response Headers and Status* (returns `statusCode`, `statusMessage`, `headers`, `body`, including the `Location` header of a created record), *Never Error* (4xx/5xx are returned, not thrown), *Response Format*, *Prefer: Transient Header*, *Timeout*.

NetSuite errors are shown clearly: the status, NetSuite's own error code and detail, and a hint for 401/403 and 429 responses. *Continue on fail* works as usual.

## Credential: NetSuite TBA API

Fill in:
- **Account ID (Realm)**: `1234567` for production, `1234567_SB1` for a sandbox.
- **Consumer Key / Consumer Secret**: from the NetSuite integration record.
- **Token ID / Token Secret**: from the access token.

Use one credential per NetSuite account (production and sandbox are separate). The credential also works in the built-in **HTTP Request** node (Authentication → Predefined Credential Type → NetSuite TBA API), where you use the full NetSuite URL.

## Notes

- The sandbox host uses a dash (`1234567-sb1`) and the realm uses an underscore (`1234567_SB1`); the node converts for you.
- Signing covers the method, the URL and its query parameters. JSON and raw bodies are not part of an OAuth 1.0 signature. Form-encoded (`application/x-www-form-urlencoded`) bodies are not signed.
- The credential's **Test** button calls `GET /services/rest/record/v1/metadata-catalog/customerMessage`.
- Oracle has announced that no new TBA integrations for REST, SOAP or RESTlets can be created from NetSuite 2027.1. Existing TBA integrations keep working.

## Credits

The signing approach is adapted from [n8n-nodes-netsuite-tba](https://www.npmjs.com/package/n8n-nodes-netsuite-tba) (MIT).

## License

MIT
