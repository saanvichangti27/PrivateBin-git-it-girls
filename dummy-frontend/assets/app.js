const BACKEND_URL = 'http://127.0.0.1:8000';

document.getElementById('createPasteBtn').addEventListener('click', async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/paste`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ciphertext: "dummy-cipher",
                iv: "dummy-iv",
                salt: "dummy-salt"
            })
        });
        const data = await response.json();
        document.getElementById('output').innerText = `Created Paste ID: ${data.id}`;
    } catch (err) {
        document.getElementById('output').innerText = `Error: ${err.message}`;
    }
});

document.getElementById('getPasteBtn').addEventListener('click', async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/paste/test123`);
        const data = await response.json();
        document.getElementById('output').innerText = `Fetched Paste: ${JSON.stringify(data)}`;
    } catch (err) {
        document.getElementById('output').innerText = `Error: ${err.message}`;
    }
});
