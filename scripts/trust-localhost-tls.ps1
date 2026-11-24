$ErrorActionPreference = 'Stop'

$tempCert = Join-Path $env:TEMP 'leap-ca.crt'
Write-Host 'Copying LEAP Local Root CA from leap-client-1...'
docker cp leap-client-1:/etc/nginx/certs/leap-ca.crt $tempCert
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to copy leap-ca.crt from leap-client-1. Make sure Docker Compose is running.'
}

Write-Host 'Importing LEAP Local Root CA into CurrentUser\Root trust store...'
certutil -user -addstore Root $tempCert
if ($LASTEXITCODE -ne 0) {
  throw 'certutil failed to import LEAP Local Root CA.'
}

Remove-Item $tempCert -Force -ErrorAction SilentlyContinue
Write-Host 'Done! Restart your browser and open https://localhost:8443 without the Not Secure warning.'
