# API Sandbox

This folder contains small, self-contained payloads and captured
responses for testing the external printing service API.

## Environment variables

All printing-related environment variables should be defined in
`backend/.env` so they can be reused by both the backend and the
sandbox script:

- `PRINTING_BASE_URL` – the base URL provided by the printing partner  
  (for example: `https://sandbox.example-printing.com`)
- `PRINTING_SERVICE_API_KEY` – API key for the printing service
- `PRINTING_SECRET_KEY` – secret key (if the provider requires
  signatures or HMAC validation).

Example `backend/.env` snippet:

```env
PRINTING_BASE_URL=https://sandbox.example-printing.com
PRINTING_SERVICE_API_KEY=U26OUe2xtDDCBgsU
PRINTING_SECRET_KEY=y2EGxeqJ59QvVA9CFFAwVYmdwkevR6IS
```

## Submitting a test order

1. Prepare a JSON payload (see `order-6455229448415.json` for the
   current example).
2. Ensure `backend/.env` contains the correct `PRINTING_BASE_URL` and
   API keys (see above).
3. Run the Node helper script from the project root, passing the JSON
   file path:

```bash
node backend/scripts/submit-print-order.js api-sandbox/order-6455229448415.json
```

The script will:

- POST the JSON body to `${PRINTING_BASE_URL}/order` with the required
  `X-API-KEY` header (same shape as the `curl` example in the PDF).
- Save the raw response to
  `api-sandbox/responses/order-6455229448415-response.json` (or a file
  name derived from your input payload name).
