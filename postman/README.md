# LEAP Postman Collection & Newman Runner

Covers all LEAP API endpoints across Platform/OpenAPI, Auth (all 5 schemes), Catalogue & Bulk CSV Import, Recommendations, Learning Path & Events, and Analytics/Admin, with automated `pm.test(...)` assertions and a collection-level auto-login pre-request script.

## Run in Postman GUI
1. Import `postman/LEAP.postman_collection.json` and `postman/LEAP.local.postman_environment.json`.
2. Select **LEAP Local** in the top-right environment picker.
3. Run the collection with the Collection Runner.

## Run from CLI with Newman (against local server or HTTPS Docker proxy)
```bash
# Against local Express API (:4000)
npx newman run postman/LEAP.postman_collection.json \
  -e postman/LEAP.local.postman_environment.json \
  --reporters cli,junit \
  --reporter-junit-export postman/newman-report.xml

# Against Nginx HTTPS reverse proxy (:8443) with self-signed cert
npx newman run postman/LEAP.postman_collection.json \
  -e postman/LEAP.local.postman_environment.json \
  --env-var "baseUrl=https://localhost:8443" \
  --env-var "apiBase=https://localhost:8443/api/v1" \
  --insecure
```
