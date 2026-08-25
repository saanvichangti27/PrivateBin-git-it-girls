import sys
import os
from fastapi.testclient import TestClient

# Force UTF-8 on Windows terminals
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.redis_client import get_redis
from app.security import block_ip, unblock_ip

client = TestClient(app)

SAMPLE = {
    "ciphertext": "AQIDBAUGBwgJCgsMDQ4PEA==",
    "iv": "MDEyMzQ1Njc4OTFi",
    "salt": "c2FsdHNhbHRzYWx0c2FsdA==",
}


def check(label: str, condition: bool, detail: str = ""):
    status = "[PASS]" if condition else "[FAIL]"
    print(f"  {status} {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        raise AssertionError(f"FAILED: {label}. {detail}")


def run_tests():
    print("Starting Python FastAPI & Redis Logic Automated Tests...\n")

    # -----------------------------------------------------------------------
    # 1. Health Check
    # -----------------------------------------------------------------------
    print("Test 1: Health Check Endpoint")
    res = client.get("/health")
    check("/health returns 200", res.status_code == 200)
    body = res.json()
    check("/health has status key", "status" in body)
    check("/health has redis key", "redis" in body)
    print()

    # -----------------------------------------------------------------------
    # 2. Validation — missing required fields
    # -----------------------------------------------------------------------
    print("Test 2: POST /paste — validation (missing iv and salt)")
    res = client.post("/paste", json={"ciphertext": "some-ciphertext"})
    check("Validation error returns 4xx", res.status_code in (400, 422), f"got {res.status_code}")
    print()

    # -----------------------------------------------------------------------
    # 3. Validation — blank field
    # -----------------------------------------------------------------------
    print("Test 3: POST /paste — validation (blank ciphertext)")
    res = client.post("/paste", json={**SAMPLE, "ciphertext": "   "})
    check("Blank ciphertext returns 4xx", res.status_code in (400, 422), f"got {res.status_code}")
    print()

    # -----------------------------------------------------------------------
    # 4. Validation — invalid ttl
    # -----------------------------------------------------------------------
    print("Test 4: POST /paste — validation (ttl = 0)")
    res = client.post("/paste", json={**SAMPLE, "ttl": 0})
    check("ttl=0 returns 4xx", res.status_code in (400, 422), f"got {res.status_code}")
    print()

    # -----------------------------------------------------------------------
    # 5. Create paste with creator_token
    # -----------------------------------------------------------------------
    print("Test 5: POST /paste — create with creator_token & max_views=2")
    res = client.post("/paste", json={**SAMPLE, "ttl": 60, "max_views": 2, "burn_threshold": 3})
    check("201 Created", res.status_code == 201, f"got {res.status_code}: {res.text}")
    data = res.json()
    paste_id = data.get("id", "")
    creator_token = data.get("creator_token", "")
    check("ID is 8 chars", len(paste_id) == 8, paste_id)
    check("creator_token exists and is >= 16 chars", len(creator_token) >= 16, creator_token)
    check("remaining_views == 2 in response", data.get("remaining_views") == 2)
    print(f"  Created Paste ID: {paste_id} | Creator Token: {creator_token[:6]}...")
    print()

    # -----------------------------------------------------------------------
    # 6. Analytics & Audit Log Verification
    # -----------------------------------------------------------------------
    print(f"Test 6: GET /paste/{paste_id}/analytics — Creator authorization & logs")
    # Unauthorized attempt
    unauth = client.get(f"/paste/{paste_id}/analytics?token=wrong_token")
    check("Wrong token rejected with 403", unauth.status_code == 403)

    # Authorized attempt
    auth = client.get(f"/paste/{paste_id}/analytics?token={creator_token}")
    check("Correct token returns 200", auth.status_code == 200)
    adata = auth.json()
    check("Status is active", adata.get("status") == "active")
    check("Total views is 0 initially", adata.get("total_views") == 0)
    check("Access logs contains CREATED event", len(adata.get("access_logs", [])) >= 1)
    print(f"  Initial Status: {adata.get('status')}, Log entries: {len(adata.get('access_logs', []))}")
    print()

    # -----------------------------------------------------------------------
    # 7. Lock & Unlock (Creator Emergency Switch)
    # -----------------------------------------------------------------------
    print(f"Test 7: Emergency Link Locking & Unlocking")
    # Lock paste
    lock_res = client.post(f"/paste/{paste_id}/toggle-lock?token={creator_token}")
    check("Lock toggle returns 200", lock_res.status_code == 200)
    check("is_locked is True", lock_res.json().get("is_locked") is True)

    # Attempt to read locked paste
    read_locked = client.get(f"/paste/{paste_id}")
    check("Reading locked paste returns 423 Locked", read_locked.status_code == 423)

    # Unlock paste
    unlock_res = client.post(f"/paste/{paste_id}/toggle-lock?token={creator_token}")
    check("Unlock toggle returns 200", unlock_res.status_code == 200)
    check("is_locked is False", unlock_res.json().get("is_locked") is False)

    # Read should now succeed and decrement views
    read_unlocked = client.get(f"/paste/{paste_id}")
    check("Reading unlocked paste returns 200 OK", read_unlocked.status_code == 200)
    check("remaining_views decremented to 1", read_unlocked.json()["remaining_views"] == 1)
    print()

    # -----------------------------------------------------------------------
    # 8. Burn on View Expiry
    # -----------------------------------------------------------------------
    print(f"Test 8: Burn on View Limit Exhaustion")
    read_2 = client.get(f"/paste/{paste_id}")
    check("Second read succeeds (remaining_views == 0)", read_2.json()["remaining_views"] == 0)

    read_3 = client.get(f"/paste/{paste_id}")
    check("Third read returns 404 (Burned)", read_3.status_code == 404)
    print()

    # -----------------------------------------------------------------------
    # 9. Auto-burn and Auto-lock on Failed Attempts
    # -----------------------------------------------------------------------
    print("Test 9: Brute-Force Defense (Auto-Lock and Auto-Burn on Failed Access Codes)")
    fail_create = client.post("/paste", json={**SAMPLE, "ttl": 60, "burn_threshold": 4})
    fail_id = fail_create.json()["id"]
    fail_token = fail_create.json()["creator_token"]

    f1 = client.post(f"/paste/{fail_id}/report-failure")
    check("Failure 1 recorded", f1.json()["burned"] is False)

    f2 = client.post(f"/paste/{fail_id}/report-failure")
    check("Failure 2 recorded", f2.json()["burned"] is False)

    f3 = client.post(f"/paste/{fail_id}/report-failure")
    check("Attempt 3: locked=True", f3.json()["locked"] is True)
    check("Attempt 3: 0 remaining", f3.json()["attempts_remaining"] == 0)

    r = client.get(f"/paste/{fail_id}")
    check("Locked paste is 403", r.status_code == 403)
    print()

    # -----------------------------------------------------------------------
    # 10. Security Blocklist Middleware (Fail2Ban)
    # -----------------------------------------------------------------------
    print("Test 10: Fail2Ban IP Blocklist Middleware")
    test_ip = "testclient"
    redis_db = get_redis()
    block_ip(redis_db, test_ip, duration_seconds=10)

    blocked_res = client.get("/paste/dummy_id")
    check("Blocked IP receives 403 Forbidden", blocked_res.status_code == 403)

    unblock_ip(redis_db, test_ip)
    unblocked_res = client.get("/paste/dummy_id")
    check("Unblocked IP proceeds (returns 404 for missing paste)", unblocked_res.status_code == 404)
    print()

    # -----------------------------------------------------------------------
    # 11. Delete Paste Endpoint
    # -----------------------------------------------------------------------
    print("Test 11: DELETE /paste/{id} by Creator")
    del_create = client.post("/paste", json={**SAMPLE, "ttl": 60})
    del_id = del_create.json()["id"]
    del_token = del_create.json()["creator_token"]

    del_res = client.delete(f"/paste/{del_id}?token={del_token}")
    check("Delete endpoint returns 200", del_res.status_code == 200)

    del_verify = client.get(f"/paste/{del_id}")
    check("Deleted paste is 404", del_verify.status_code == 404)
    print()

    print("ALL ADVANCED SECURITY & ACCESS CONTROL TESTS PASSED SUCCESSFULLY! 🚀")


if __name__ == "__main__":
    run_tests()
