#!/bin/sh
cd "$(dirname "$0")" || exit 1
HOST=0.0.0.0 exec node server.mjs
