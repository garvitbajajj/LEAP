/** Mounts every vertical's router. Each vertical adds its own line here. */
module.exports = function mountRoutes(app) {
  app.get('/', (req, res) => res.json({ name: 'LEAP API', docs: '/api/v1/docs' }));
};
