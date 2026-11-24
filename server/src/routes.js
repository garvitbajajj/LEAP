/** Mounts every vertical's router under /api/v1. */
module.exports = function mountRoutes(app) {
  app.get('/', (req, res) => res.json({ name: 'LEAP API', docs: '/api/v1/docs' }));

  app.use('/api/v1', require('./auth/routes'));
  app.use('/api/v1', require('./admin/routes'));
  app.use('/api/v1', require('./catalogue/routes'));
  app.use('/api/v1', require('./path/routes'));
  app.use('/api/v1', require('./events/routes'));
  app.use('/api/v1', require('./recommendations/routes'));
};
