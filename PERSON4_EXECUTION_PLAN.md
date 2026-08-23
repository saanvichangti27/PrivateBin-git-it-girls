# Execution Plan — Person 4 (CSP / SRI)

## Your dependencies on others

| You need | From | Why |
|---|---|---|
| Final frontend build output (what origins it loads scripts/styles/fonts from) | Person 3 | CSP directives (`script-src`, `style-src`, `connect-src`, `font-src`) must match real resource origins |
| Backend base URL / API routes | Person 2 | `connect-src` must allow the API origin |
| Whether any external CDN is used anywhere | Person 3 | Determines if SRI is even needed — if everything is self-hosted/bundled by Vite, SRI has near-zero value |

Since these aren't ready yet, build against **dummies** below so you're not blocked.

---

## Step 1 — Dummy frontend to test CSP against

Don't wait for the real React app. Make a minimal static HTML page that mimics what a Vite build outputs: one bundled JS file, one CSS file, no external CDN by default.

```
/dummy-frontend/
  index.html
  assets/app.js
  assets/app.css
```

`index.html` should look like a real Vite build's `<head>` (bundled `<script type="module" src="/assets/app.js">`, `<link rel="stylesheet" href="/assets/app.css">`). This lets you write and test a real CSP header today.

## Step 2 — Dummy backend to test `connect-src`

Don't wait for FastAPI. Spin up the simplest possible mock server (even a 5-line `http.server` or `json-server`) that responds to:
- `POST /api/paste` → `{"id": "test123"}`
- `GET /api/paste/test123` → dummy ciphertext/iv/salt

Point your dummy frontend's fetch calls at this mock. This validates your `connect-src` directive works end-to-end without Person 2's real backend.

## Step 3 — Draft the CSP header

Baseline, self-hosted-everything policy (adjust once real origins are known):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  connect-src 'self';
  img-src 'self' data:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

Notes:
- No `'unsafe-inline'` unless Person 3's build genuinely requires it — check the real Vite output first; many setups avoid inline styles/scripts entirely.
- I'm not fully certain which exact directive values you'll need until you see the real build — treat the above as a starting template, not final.

## Step 4 — SRI

- If frontend stays 100% self-bundled (no CDN), SRI adds little — document that decision rather than force-adding it.
- If any external resource is loaded (e.g. a font CDN), add `integrity="sha384-..."` — generate hashes with a real tool (e.g. `openssl dgst -sha384 -binary file | openssl base64 -A`) once the actual file is final. Don't hand-write a hash.

## Step 5 — Swap dummies for real integration

Once Person 2 and Person 3 have working builds:
1. Replace dummy backend URL with real FastAPI base URL in `connect-src`.
2. Replace dummy frontend with the real Vite build output; recheck `script-src`/`style-src` against actual generated files.
3. Re-test the whole flow (create paste → load paste) with real CSP header active — watch browser console for any CSP violation errors.

## Step 6 — Document for judges (Documentation & Explanation, 10 marks)

Write a short note explaining:
- What CSP directives you chose and why
- Whether SRI was used and why/why not
- How this maps back to the specific threat (XSS stealing plaintext/keys client-side) called out in the project brief §5.1

---

## Summary of what to build right now, without waiting on anyone

1. Dummy static frontend (Step 1)
2. Dummy mock backend (Step 2)
3. Draft CSP header + test it against the dummies (Step 3)
4. SRI decision + hash-generation process ready to go (Step 4)

This gets you to a fully tested, swap-in-ready CSP/SRI setup before the real frontend/backend even exist.
