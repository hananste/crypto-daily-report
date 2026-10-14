#!/bin/sh
# Gather today's report, then serve read-only on 127.0.0.1 (default port 8790).
cd "$(dirname "$0")" && python3 gather.py && python3 serve.py "${1:-8790}"
