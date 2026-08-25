import sys
import os
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.main import app

client = TestClient(app)

def test_delete():
    SAMPLE = {
        "ciphertext": "AQIDBAUGBwgJCgsMDQ4PEA==",
        "iv": "MDEyMzQ1Njc4OTFi",
        "salt": "c2FsdHNhbHRzYWx0c2FsdA==",
        "ttl": 60,
    }
    # Create paste
    res = client.post("/paste", json=SAMPLE)
    assert res.status_code == 201
    data = res.json()
    paste_id = data["id"]
    admin_token = data["admin_token"]
    
    # Try to delete with wrong token
    res = client.delete(f"/paste/{paste_id}?admin_token=wrong")
    assert res.status_code == 401
    
    # Try to delete with correct token
    res = client.delete(f"/paste/{paste_id}?admin_token={admin_token}")
    assert res.status_code == 200
    
    # Verify paste is gone
    res = client.get(f"/paste/{paste_id}")
    assert res.status_code == 404
    
    print("Delete test passed successfully!")

if __name__ == "__main__":
    test_delete()
