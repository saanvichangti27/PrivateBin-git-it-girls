import sys
import os
from fastapi.testclient import TestClient

# Force UTF-8 on Windows terminals
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app

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
    check("Validation error returns 4xx", res.status_code in (400, 422),
          f"got {res.status_code}")
    print()

    # -----------------------------------------------------------------------
    # 3. Validation — blank field
    # -----------------------------------------------------------------------
    print("Test 3: POST /paste — validation (blank ciphertext)")
    res = client.post("/paste", json={**SAMPLE, "ciphertext": "   "})
    check("Blank ciphertext returns 4xx", res.status_code in (400, 422),
          f"got {res.status_code}")
    print()

    # -----------------------------------------------------------------------
    # 4. Validation — invalid ttl
    # -----------------------------------------------------------------------
    print("Test 4: POST /paste — validation (ttl = 0)")
    res = client.post("/paste", json={**SAMPLE, "ttl": 0})
    check("ttl=0 returns 4xx", res.status_code in (400, 422), f"got {res.status_code}")
    print()

    # -----------------------------------------------------------------------
    # 5. Create paste with max_views = 2
    # -----------------------------------------------------------------------
    print("Test 5: POST /paste — create with max_views=2, burn_threshold=3")
    res = client.post("/paste", json={**SAMPLE, "ttl": 60, "max_views": 2, "burn_threshold": 3})
    check("201 Created", res.status_code == 201, f"got {res.status_code}: {res.text}")
    data = res.json()
    paste_id = data.get("id", "")
    check("ID is 8 chars", len(paste_id) == 8, paste_id)
    check("remaining_views == 2 in response", data.get("remaining_views") == 2)
    print(f"  Created Paste ID: {paste_id}")
    print()

    # -----------------------------------------------------------------------
    # 6. GET /paste/{id} — first fetch: remaining_views becomes 1
    # -----------------------------------------------------------------------
    print(f"Test 6: GET /paste/{paste_id} — first fetch, decrement to 1")
    res = client.get(f"/paste/{paste_id}")
    check("200 OK", res.status_code == 200)
    check("remaining_views == 1", res.json()["remaining_views"] == 1)
    print()

    # -----------------------------------------------------------------------
    # 7. GET /paste/{id} — second fetch: remaining_views hits 0, paste burned
    # -----------------------------------------------------------------------
    print(f"Test 7: GET /paste/{paste_id} — second fetch, exhausts views -> burned")
    res = client.get(f"/paste/{paste_id}")
    check("200 OK", res.status_code == 200)
    check("remaining_views == 0", res.json()["remaining_views"] == 0)
    print()

    # -----------------------------------------------------------------------
    # 8. GET /paste/{id} — third fetch: 404 (burned)
    # -----------------------------------------------------------------------
    print(f"Test 8: GET /paste/{paste_id} — third fetch -> 404")
    res = client.get(f"/paste/{paste_id}")
    check("404 Not Found", res.status_code == 404)
    print()

    # -----------------------------------------------------------------------
    # 9. Create unlimited-view paste (no max_views)
    # -----------------------------------------------------------------------
    print("Test 9: POST /paste — unlimited views (no max_views)")
    res = client.post("/paste", json={**SAMPLE, "ttl": 60})
    check("201 Created", res.status_code == 201)
    unlimited_id = res.json()["id"]
    check("remaining_views is None in response", res.json()["remaining_views"] is None)

    # Fetch 3 times — should never 404 just from views
    for i in range(1, 4):
        r = client.get(f"/paste/{unlimited_id}")
        check(f"Unlimited view fetch #{i} returns 200", r.status_code == 200)
        check(f"remaining_views is 0 (unlimited sentinel)", r.json()["remaining_views"] == 0)
    print()

    # -----------------------------------------------------------------------
    # 10. Auto-burn on failed decryption attempts
    # -----------------------------------------------------------------------
    print("Test 10: Auto-Burn on Failed Decryption Attempt Threshold (threshold=3)")
    res = client.post("/paste", json={**SAMPLE, "ttl": 60, "burn_threshold": 3})
    fail_id = res.json()["id"]
    print(f"  Created Paste ID: {fail_id}")

    f1 = client.post(f"/paste/{fail_id}/report-failure")
    check("Attempt 1: not burned", f1.json()["burned"] is False)
    check("Attempt 1: 2 remaining", f1.json()["attempts_remaining"] == 2)

    f2 = client.post(f"/paste/{fail_id}/report-failure")
    check("Attempt 2: not burned", f2.json()["burned"] is False)
    check("Attempt 2: 1 remaining", f2.json()["attempts_remaining"] == 1)

    f3 = client.post(f"/paste/{fail_id}/report-failure")
    check("Attempt 3: burned=True", f3.json()["burned"] is True)
    check("Attempt 3: 0 remaining", f3.json()["attempts_remaining"] == 0)

    r = client.get(f"/paste/{fail_id}")
    check("Auto-burned paste is 404", r.status_code == 404)
    print()

    # -----------------------------------------------------------------------
    # 11. report-failure on nonexistent paste returns 404
    # -----------------------------------------------------------------------
    print("Test 11: report-failure on nonexistent paste_id -> 404")
    res = client.post("/paste/doesnotexist/report-failure")
    check("404 for unknown paste", res.status_code == 404)
    print()

    print("ALL PYTHON FASTAPI & REDIS LOGIC TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_tests()
