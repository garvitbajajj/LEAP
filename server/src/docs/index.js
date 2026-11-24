const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const express = require('express');
const swaggerUi = require('swagger-ui-express');

const spec = yaml.load(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));

const router = express.Router();

router.get('/openapi.json', (req, res) => res.json(spec));
router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, {
  customSiteTitle: 'LEAP API Docs',
  swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, tryItOutEnabled: true },
}));

module.exports = { router, spec };
