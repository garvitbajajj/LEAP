#!/usr/bin/env sh
set -eu

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CERT_PATH="$DIR/leap.crt"
KEY_PATH="$DIR/leap.key"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$KEY_PATH" \
  -out "$CERT_PATH" \
  -subj "/C=IN/ST=Rajasthan/L=Neemrana/O=NIIT University Team 35/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Generated self-signed TLS certificate:"
echo "  Cert: $CERT_PATH"
echo "  Key : $KEY_PATH"
