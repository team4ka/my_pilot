# tracking_service

Static tracking pages rendered in Royal Mail (UK) / DHL (DE) style.

Currently implemented: **UK / Royal Mail**.

## Layout

```
tracking_service/
|- app.py                      # FastAPI: POST /api/tracking/generate + GET /track-and-verification/{orderNumber}
|- generator.py                # Pure HTML generator (used by both API and CLI)
|- models.py                   # Pydantic schemas for the incoming payload
|- cli_generate.py             # Generate pages from samples/ without running the API
|- requirements.txt
|- templates/
|   `- royalmail/order.html.jinja
|- static/
|   `- royalmail/
|       |- css/royalmail.css
|       |- img/logo-royalmail.svg
|       `- img/favicon.svg
|- files/
|   `- placeholder.pdf         # downloadable stub, will be replaced later
|- samples/
|   `- sample_orders.json
|- data/
|   |- orders/<orderNumber>.json        # saved payloads (created at runtime)
|   `- generated/<orderNumber>/index.html
`- deploy/
    |- nginx.example.conf      # reverse proxy example for future domain
    `- tracking-service.service
```

## Run the API locally

```powershell
python -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r tracking_service/requirements.txt

$env:TRACKING_API_KEY = "dev-secret"
$env:PUBLIC_BASE_URL  = "http://127.0.0.1:8088"

uvicorn tracking_service.app:app --reload --port 8088
```

Test with sample payload:

```powershell
$body = Get-Content tracking_service/samples/sample_orders.json -Raw | ConvertFrom-Json | Select-Object -First 1 | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8088/api/tracking/generate `
  -Headers @{Authorization="Bearer dev-secret"; "Content-Type"="application/json"} `
  -Body $body
```

Then open the returned `trackingUrl` in a browser.

## Preview pages locally without the API

```powershell
python tracking_service/cli_generate.py
```

Pages are written to `tracking_service/data/generated/<orderNumber>/index.html`.
To view them with styles/logo/download working, start the API and open
`http://127.0.0.1:8088/track-and-verification/<orderNumber>`.

## API contract

`POST /api/tracking/generate`

Headers:
- `Authorization: Bearer <TRACKING_API_KEY>`
- `Content-Type: application/json`

Body: see `samples/sample_orders.json`. Regions: `uk` (implemented) / `de` (501).

Response 200:
```json
{ "trackingUrl": "https://<domain>/track-and-verification/ORD-2026-0416-058" }
```

Errors: `400 invalid JSON / validation`, `401 unauthorized`, `501 region not implemented`, `500 generation failed` with `{ "error": "..." }`.
