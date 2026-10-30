#!/usr/bin/env python3
"""Recreate admin.js with proper UTF-8 encoding."""
import os

# Read the original file - it may be corrupted but structure is intact
src = "/opt/cwfly/backend/src/routes/admin.js"
with open(src, "rb") as f:
    raw = f.read()

# Try reading as UTF-8, fall back to latin-1
try:
    text = raw.decode("utf-8")
except:
    text = raw.decode("latin-1")

# The file has mojibake Chinese. Since the structure (imports, calls) is intact,
# and only Chinese strings in comments/strings are affected,
# we need to fix them. But it's easier to just rewrite the Chinese parts.

# Read a clean reference file (auth.js) for proper encoding
# auth.js should have correct Chinese
auth_path = "/opt/cwfly/backend/src/routes/auth.js"
# Use the first admin.js we uploaded earlier as the structural base

# Save as proper UTF-8
with open(src + ".fixed", "wb") as f:
    f.write(text.encode("utf-8"))

print(f"File size: {len(raw)} bytes")
print("Written to admin.js.fixed")
