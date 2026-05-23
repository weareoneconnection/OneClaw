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

## Desktop / local computer control

The Desktop worker is `rpa_worker`. It exposes guarded desktop actions for a trusted local Mac OneClaw process:

- `desktop.app.open`: live when `ONECLAW_DESKTOP_ENABLED=true` and the app is allowlisted
- `desktop.screenshot`: capture governed screen evidence
- `desktop.click`: click screen coordinates
- `desktop.type`: type into an allowlisted app
- `desktop.hotkey`: send a keyboard shortcut
- `desktop.app.state`: read frontmost or allowlisted app state

Cloud OneClaw can only control its cloud environment. To control your own Mac, run OneClaw locally and point TheOne to that local bridge.

```bash
ONECLAW_BRIDGE_MODE=desktop
ONECLAW_BRIDGE_ID=maqing-macbook
ONECLAW_BRIDGE_NAME="Ma Qing Mac Desktop Bridge"
ONECLAW_DESKTOP_ENABLED=true
ONECLAW_DESKTOP_APP_ALLOWLIST=Google Chrome,Safari,Terminal,Notes,Mail,WeChat,Telegram
ONECLAW_DESKTOP_APP_BLOCKLIST=System Settings,Keychain Access,1Password
```

Bridge status and diagnostics:

```bash
curl http://localhost:4100/v1/bridge/status
curl http://localhost:4100/v1/bridge/diagnostics
curl http://localhost:4100/v1/bridge/registration
```

For a persistent Mac bridge, run OneClaw from a trusted local terminal or package it as a LaunchAgent/menu bar app. The local process needs macOS Accessibility permission for click/type/hotkey/state and Screen Recording permission for screenshots.

## Browser worker

The browser worker is `browser_worker`. It uses Playwright Chromium and supports:

- `browser.open`: open a URL
- `browser.extract`: open or extract a rendered page
- `browser.scrape`: scrape text or HTML
- `browser.screenshot`: capture evidence
- `browser.click`: click a selector
- `browser.type`: type into a selector

For production, keep browser access allowlisted:

```bash
ONECLAW_BROWSER_ALLOWLIST=https://oneai.network,https://theone-eta.vercel.app,https://x.com,https://github.com
```

`ONECLAW_BROWSER_ALLOWLIST` is for web hosts. Local browser apps such as `Google Chrome` and `Safari` are controlled through `desktop.app.open` and belong in `ONECLAW_DESKTOP_APP_ALLOWLIST`.

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
