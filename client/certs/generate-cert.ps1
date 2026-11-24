$ErrorActionPreference = 'Stop'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CertPath = Join-Path $Dir 'leap.crt'
$KeyPath = Join-Path $Dir 'leap.key'

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
  throw "OpenSSL is not in PATH. Install Git for Windows (includes openssl.exe) or OpenSSL, or rely on the Docker entrypoint to auto-generate certs."
}

openssl req -x509 -nodes -newkey rsa:2048 -days 365 `
  -keyout $KeyPath `
  -out $CertPath `
  -subj "/C=IN/ST=Rajasthan/L=Neemrana/O=NIIT University Team 35/CN=localhost" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

Write-Host "Generated self-signed TLS certificate:"
Write-Host "  Cert: $CertPath"
Write-Host "  Key : $KeyPath"
