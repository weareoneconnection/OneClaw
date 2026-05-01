# OneClaw V5 Phase 4

Phase 4 adds four major upgrades on top of Phase 3:

- real X publishing chain with optional media upload and replies
- Postgres migration runner
- approval admin console UI
- task listing and operational APIs for admin workflows

## Quick start

```bash
cp .env.example .env
npm install
npx playwright install chromium
npm run migrate
npm run dev
```

If using BullMQ, run a worker too:

```bash
npm run dev:worker
```

Then open:

- API: `http://localhost:4100`
- Admin UI: `http://localhost:4100/admin`

`

## X publishing payload

```json
{
  "action": "social.post",
  "approvalMode": "manual",
  "input": {
    "channel": "x",
    "content": "Hello from OneClaw",
    "replyToTweetId": "optional",
    "mediaPaths": ["./artifacts/image.png"]
  }
}
```

## Notes

- The X adapter uses OAuth 1.0a user context and the v2 tweets API.
- Media upload uses the v1.1 upload endpoint.
- The admin console is intentionally lightweight and server-rendered as static assets so it can live with the API service.
- This package is a production-oriented scaffold. You should validate env credentials, queue, database, and X permissions in your own environment before treating it as production-ready.
