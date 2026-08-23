# Security Decisions: CSP and SRI (Person 4)

## Overview
This document outlines the security measures implemented to protect the frontend of our zero-knowledge pastebin against client-side attacks, specifically Cross-Site Scripting (XSS). These implementations directly fulfill the "Technical Implementation & Architecture" and "Problem Understanding & Core Functionality" criteria in the CloneFest 2.0 rubric.

## Threat Model (Why XSS is our biggest enemy)
In our architecture, the server never sees the plaintext or the decryption key (access code). Decryption happens entirely in the browser using the WebCrypto API. 

Therefore, the primary threat is **XSS (Cross-Site Scripting)**. If an attacker can inject malicious JavaScript into our frontend, they can:
1. Steal the plaintext after the user decrypts it.
2. Steal the access code as the user types it.
3. Exfiltrate this data to an attacker-controlled server.

To mitigate this, we implemented a strict Content-Security-Policy (CSP) and established Subresource Integrity (SRI) guidelines.

## Content-Security-Policy (CSP)
We enforce a strict CSP to restrict where scripts can be loaded from and where data can be sent. 

**Our Policy:**
```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' [API_ORIGIN]; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
```

**Key Directives Explained:**
- `script-src 'self'`: This completely bans inline scripts (e.g., `<script>...</script>`) and `eval()`. It guarantees that only scripts originating from our own trusted domain are executed. If an attacker manages to inject an HTML script tag into a paste, the browser will refuse to run it.
- `connect-src 'self' [API_ORIGIN]`: This ensures that the frontend can only make network requests to our specific FastAPI backend. Even if a script somehow bypassed execution restrictions, it could not send stolen data to an external server.
- `frame-ancestors 'none'`: Prevents clickjacking by ensuring our application cannot be embedded in an `<iframe>` on a malicious site.

## Subresource Integrity (SRI)
By default, we aim to self-host all frontend assets by bundling them locally (e.g., via Vite). This removes the risk of a compromised CDN serving malicious scripts.

However, if external CDNs are required (e.g., for fonts or specific libraries), we have mandated the use of **Subresource Integrity (SRI)**. 

SRI ensures that the browser verifies the cryptographic hash (SHA-384) of the fetched file before executing it. We have developed an internal utility script (`scripts/generate_sri.py`) to automatically generate these hashes, guaranteeing that any third-party asset tampering is instantly blocked by the browser.
