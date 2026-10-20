#!/usr/bin/env python3
"""Creates an APP_PASSWORD_HASH value without Node.js (Python 3 standard library only).

    python3 scripts/hash-password.py

Same format as scripts/hash-password.mjs: scrypt:<N>:<r>:<p>:<salt b64url>:<hash b64url>
"""
import base64, getpass, hashlib, os, sys, unicodedata

pw = getpass.getpass("Passwort: ") if sys.stdin.isatty() else sys.stdin.read().rstrip("\r\n")
if len(pw) < 8:
    sys.exit("Das Passwort muss mindestens 8 Zeichen lang sein.")
salt = os.urandom(16)
key = hashlib.scrypt(unicodedata.normalize("NFKC", pw).encode(), salt=salt, n=16384, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=64)
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
print(f"APP_PASSWORD_HASH=scrypt:16384:8:1:{b64(salt)}:{b64(key)}")
