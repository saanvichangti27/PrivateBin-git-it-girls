import secrets

CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'

def generate_paste_id(length: int = 8) -> str:
    """
    Generates a short, URL-safe random paste ID.
    Uses secrets.choice to ensure cryptographic randomness without modulo bias.
    """
    return ''.join(secrets.choice(CHARSET) for _ in range(length))
