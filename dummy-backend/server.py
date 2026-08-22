import http.server
import socketserver
import json

PORT = 8000

class DummyBackendHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for our dummy frontend testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/paste/test123':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                "ciphertext": "dummy-base64-ciphertext",
                "iv": "dummy-base64-iv",
                "salt": "dummy-base64-salt"
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/api/paste':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {"id": "test123"}
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), DummyBackendHandler) as httpd:
        print(f"Dummy backend running on http://127.0.0.1:{PORT}")
        httpd.serve_forever()
