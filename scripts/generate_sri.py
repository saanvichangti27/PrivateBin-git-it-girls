import hashlib
import base64
import sys
import urllib.request

def generate_sri_from_data(data):
    digest = hashlib.sha384(data).digest()
    b64 = base64.b64encode(digest).decode('utf-8')
    return f"sha384-{b64}"

def generate_sri(path_or_url):
    try:
        if path_or_url.startswith('http://') or path_or_url.startswith('https://'):
            print(f"Fetching {path_or_url}...")
            with urllib.request.urlopen(path_or_url) as response:
                data = response.read()
        else:
            with open(path_or_url, 'rb') as f:
                data = f.read()
        
        return generate_sri_from_data(data)
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python generate_sri.py <filepath_or_url>")
        sys.exit(1)
    
    target = sys.argv[1]
    sri_hash = generate_sri(target)
    
    if sri_hash:
        print(f"\nSRI Hash for {target}:")
        print(sri_hash)
        print(f'\nExample HTML usage:')
        print(f'<script src="{target}" integrity="{sri_hash}" crossorigin="anonymous"></script>')
