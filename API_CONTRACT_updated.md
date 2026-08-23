# CloneFest 2.0 — Task 1: API Contract & Project Spec

Status: MVP / core structure. Rate limiting, geo-detection, expiry enforcement, etc. are future additions (columns reserved, logic not yet implemented).

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| Database | Redis |
| Crypto | WebCrypto API (browser-native), implemented in `crypto.js` |
| Repo structure | Monorepo: `/frontend`, `/backend` |

Not decided yet / confirm separately: hosting, deployment method, ID generation library (see §5).

---

## 2. Crypto Model (reference: `crypto.js`, already implemented by Person 1)

- Key derivation: `deriveKeyFromCode(accessCode, salt)` → PBKDF2 (100,000 iterations, SHA-256) → 256-bit AES-GCM `CryptoKey`.
- Encryption: `encryptSecret(plaintext, key)` → random 12-byte IV → returns `{iv, ciphertext}` (both base64).
- `encryptFull(plaintext, accessCode)` → generates random 16-byte salt, derives key, encrypts → returns `{ciphertext, iv, salt}` (all base64).
- `decryptFull(ciphertext, iv, salt, accessCode)` → re-derives key from access code + stored salt, decrypts.
- `generateAccessCode()` → 8-character human-readable code (32-char alphabet, no `0/O/1/I`).

**Important architectural consequence:** there is no `#fragment` key. The access code is the only secret, and it is never sent to or stored by the server. The **salt is not secret** — it must travel with the ciphertext (server stores and returns it), because the client needs it to re-derive the key.

**Key rule for whoever writes backend/frontend code touching crypto:** do not assume function names, params, or return shapes beyond what's listed above — check `crypto.js` directly before calling into it, since I'm summarizing, not restating guaranteed-stable API surface.

---

## 3. Link / Sharing Model

- The shareable link encodes **only the paste ID**: `https://yourapp.com/paste/{id}`
- The **access code is shared separately**, out of band (verbally, chat app, etc.) — same trust model as PrivateBin's optional password, but mandatory here.
- Server never sees the access code, ever, at any endpoint.

---

## 4. Database Schema (Redis Key-Value Store)

Instead of SQLite, we are using Redis to automatically handle Time-to-Live (TTL) expiration and high-performance atomic operations for view counting and burning.

**Key:** `paste:{id}`
**Value (JSON Document):**
```json
{
  "ciphertext": "base64-string",
  "iv": "base64-string",
  "salt": "base64-string",
  "burn_threshold": 5,
  "failed_attempts": 0,
  "max_views": 10,       // Optional
  "views": 0,            // Tracked if max_views is set
  "expires_at": "ISO-8601-timestamp"
}
```

---

## 5. Paste ID Generation **[DECIDED]**

Backend generates the ID at insert time (not the client), so ID generation and DB write stay atomic and trustless.

- Method: short URL-safe random token (e.g. Python's `secrets.token_urlsafe()` or equivalent — verify exact current syntax/library before using) rather than a full UUID, for a shorter, cleaner link.
- Backend should check for ID collisions on insert and retry if one occurs — very unlikely at this scale, but cheap to guard against.

---

## 6. API Routes

### `POST /paste`
Create a new paste.

Request body:
```json
{
  "ciphertext": "base64-string",
  "iv": "base64-string",
  "salt": "base64-string",
  "ttl": 86400,
  "max_views": null,
  "burn_threshold": 5
}
```

Response `201 Created`:
```json
{
  "id": "generated-paste-id",
  "expires_at": "ISO-8601-timestamp",
  "remaining_views": null,
  "burn_threshold": 5
}
```

Errors:
- `422` — missing/invalid field(s)

---

### `GET /paste/{id}`
Retrieve a paste for client-side decryption.

Response `200 OK`:
```json
{
  "id": "paste-id",
  "ciphertext": "base64-string",
  "iv": "base64-string",
  "salt": "base64-string",
  "remaining_views": 9,
  "expires_at": "ISO-8601-timestamp"
}
```

Errors:
- `404` — paste not found (or already burned/expired)

---

### `POST /paste/{id}/report-failure`
Report a failed decryption attempt (wrong access code) to increment the burn counter. If the burn threshold is reached, the paste is securely destroyed in Redis.

Request body: `{}` (Empty)

Response `200 OK`:
```json
{
  "burned": false,
  "attempts_remaining": 4,
  "message": "Failed attempt recorded"
}
```

Errors:
- `404` — paste not found

---

### Error format (all endpoints)
```json
{
  "error": "human-readable message"
}
```

---

## 7. CORS

FastAPI backend must allow the Vite dev server origin (typically `http://localhost:5173` — confirm actual port Person 3 uses) in dev, and the deployed frontend origin in prod.

---

## 8. Out of Scope for MVP (Future Work)

- Geo-anomaly detection
- Access history / security dashboard
- Advanced Rate limiting / auto-block per IP

*(Note: Enforced expiration, burn-after-read, and burn-on-failure have already been implemented using Redis!)*

---

## Open items still needing a decision (not blocking MVP start)

- Deployment target
