# Security and Access Control Features

This document outlines the detailed descriptions and proposed implementation strategies for the advanced security and access control features of the project.

## 1. Link Expiration (Time-to-Live)
### Description
Users can define a specific time limit for how long a shared link remains active. Once the time expires, the link becomes invalid, and the content is inaccessible and potentially purged from the database.

### Implementation Details
*   **Database:** Add an `expires_at` (TIMESTAMP) column to the primary `Link` or `Paste` table.
*   **Backend:**
    *   During link creation, calculate the `expires_at` timestamp based on user input (e.g., 1 hour, 1 day, 1 week from creation).
    *   On every read request, compare the current server time with `expires_at`. If `current_time > expires_at`, return a `404 Not Found` or `410 Gone` and deny access.
    *   **Cleanup Job:** Implement a background task (e.g., a cron job or Redis key expiration event) to periodically and permanently delete expired records from the database to save space.
*   **Frontend:** Add a dropdown or date/time picker on the creation form to select the expiration duration.

## 2. View Count Limit (Burn After Reading)
### Description
Users can specify the maximum number of times a link can be opened. Once the view count reaches this limit, the link is destroyed or deactivated. Setting the limit to '1' creates a classic "burn after reading" link.

### Implementation Details
*   **Database:** Add `max_views` (INT) and `current_views` (INT, default 0) columns to the table.
*   **Backend:**
    *   When creating a link, set `max_views` based on user input.
    *   On a successful read request, increment `current_views`. This must be an atomic database operation (e.g., `UPDATE table SET current_views = current_views + 1 WHERE id = ?`) to prevent race conditions from concurrent requests.
    *   If `current_views >= max_views`, immediately invalidate the link, return the content one last time (if it's the exact final view), and then delete or mark the record as inactive.
*   **Frontend:** Add a number input field on the creation form to set the maximum allowed views.

## 3. Security and Analytics Dashboard
### Description
A dashboard for the link creator that provides insights into how their links are being interacted with. It tracks metrics such as total views and access timestamps.

### Implementation Details
*   **Database:** Create a separate `AccessLogs` table linked to the `Link` ID via a foreign key.
    *   **Columns:** `id`, `link_id`, `accessed_at` (TIMESTAMP), `ip_address` (hashed or anonymized for privacy/GDPR compliance), `user_agent`.
*   **Backend:**
    *   Create a middleware or service that asynchronously writes a new record to the `AccessLogs` table every time a link is successfully (or unsuccessfully) accessed.
    *   Create API endpoints for the dashboard to aggregate this data (e.g., views per day, device types).
*   **Frontend:** Build a dashboard UI using charting libraries (like Chart.js, Recharts, or Nivo) to visualize the access data over time, show the current status (Active/Expired), and display a table of recent access events.

## 4. Suspicious Action Detection
### Description
The system proactively identifies anomalous behavior, such as brute-force guessing of link IDs/passwords.

### Implementation Details
*   **Failed Access Tracking:**
    *   Log failed attempts (e.g., wrong password for a protected link, or querying non-existent links) in Redis or a fast in-memory store, keyed by IP address and Link ID.
*   **Backend Logic:** Implement an analysis service that evaluates the `AccessLogs` and failed attempt logs against defined rules (e.g., " > 5 failed password attempts in 1 minute").

## 5. Automated Response: Blocking & Rate Limiting
### Description
Once suspicious action is detected, the system automatically takes defensive measures to protect the data, such as rate limiting the offending IP or temporarily locking the link.

### Implementation Details
*   **Rate Limiting (API Gateway/Middleware):**
    *   Use Redis to implement a Token Bucket or Leaky Bucket algorithm.
    *   Limit the number of requests per IP address across the entire application (e.g., max 100 requests per minute).
    *   Apply stricter rate limits to sensitive endpoints like password submission for a link (e.g., max 5 attempts per minute per IP). Return HTTP `429 Too Many Requests`.
*   **Access Blocking (Fail2Ban logic):**
    *   If an IP crosses the threshold for suspicious activity (e.g., consistent brute-force attempts), add the IP to a Redis "blocklist" with a TTL (Time-To-Live, e.g., 1 hour).
    *   Middleware should check the blocklist before processing any request; if the IP is blocked, immediately drop the request (return HTTP `403 Forbidden` or drop the connection entirely).
*   **Link Locking:** If a specific link is under targeted attack (e.g., massive traffic spike attempting to guess a password), the system can temporarily set the link status to `LOCKED`. This prevents any further access even with correct credentials, requiring the creator to manually unlock it from their dashboard.

## 6. Secure File Sharing (File Input)
### Description
In addition to text, users can securely share files. Files are encrypted on the client-side before being uploaded and shared via a link, ensuring zero-knowledge privacy similar to text pastes.

### Implementation Details
*   **Database/Storage:** 
    *   Store the encrypted file blobs in a secure storage system (e.g., cloud storage bucket or local file system), keyed by a unique file identifier.
    *   Update the `Paste` or `Link` table to include fields for file metadata, such as an encrypted `file_name` and a `file_id` referencing the stored blob.
*   **Backend:**
    *   Create streaming endpoints for uploading and downloading encrypted file data to handle large files efficiently.
    *   Apply the existing expiration (`expires_at`) and view limit (`max_views`) logic to the file storage records, ensuring the file blob is permanently deleted when the link expires or the view limit is reached.
*   **Frontend:**
    *   Add a file upload input area to the paste creation form (e.g., drag-and-drop zone).
    *   Use the `FileReader` API to read the file locally, encrypt the data using the same client-side cryptographic keys and algorithms used for text, and then upload the encrypted payload.
    *   For retrieval, download the encrypted blob, decrypt it locally in the browser, and present it as a downloadable file to the user.
