#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CA_CERT="${CERT_DIR}/leap-ca.crt"
CA_KEY="${CERT_DIR}/leap-ca.key"
CERT_FILE="${CERT_DIR}/leap.crt"
KEY_FILE="${CERT_DIR}/leap.key"
EXT_FILE="/tmp/leap-ext.cnf"

mkdir -p "$CERT_DIR"

if [ ! -f "$CA_CERT" ] || [ ! -f "$CA_KEY" ]; then
  echo "Generating local LEAP Root CA at ${CERT_DIR}..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CA_KEY" \
    -out "$CA_CERT" \
    -subj "/C=IN/ST=Rajasthan/L=Neemrana/O=LEAP Local Dev CA/CN=LEAP Local Root CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
  chmod 600 "$CA_KEY"
fi

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "Generating CA-signed TLS certificate for Nginx at ${CERT_DIR}..."
  cat > "$EXT_FILE" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
EOF
  openssl req -nodes -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out /tmp/leap.csr \
    -subj "/C=IN/ST=Rajasthan/L=Neemrana/O=NIIT University Team 35/CN=localhost" >/dev/null 2>&1
  openssl x509 -req -in /tmp/leap.csr \
    -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$CERT_FILE" -days 365 -sha256 -extfile "$EXT_FILE" >/dev/null 2>&1
  rm -f /tmp/leap.csr "$EXT_FILE"
  chmod 600 "$KEY_FILE"
fi
