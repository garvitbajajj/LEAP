/**
 * MongoDB native Role-Based Access Control (RBAC) initialization script.
 * Creates least-privilege database users on the `leap` database:
 *   - leap_app:       readWrite on `leap` (used by the Express API server)
 *   - leap_analytics: read on `leap` (read-only reporting / BI queries)
 *   - leap_admin:     dbAdmin + userAdmin on `leap`, clusterAdmin on `admin`
 *
 * Usage (against a running MongoDB instance with --auth):
 *   mongosh < infra/mongo/init-rbac.js
 */
const adminDb = db.getSiblingDB('admin');
const leapDb = db.getSiblingDB('leap');

const appPassword = process.env.MONGO_APP_PASSWORD || 'leap-app-dev-pass';
const analyticsPassword = process.env.MONGO_ANALYTICS_PASSWORD || 'leap-analytics-dev-pass';
const adminPassword = process.env.MONGO_ADMIN_PASSWORD || 'leap-admin-dev-pass';

function upsertUser(targetDb, user, pwd, roles) {
  const existing = targetDb.getUser(user);
  if (existing) {
    targetDb.updateUser(user, { pwd, roles });
    print(`Updated MongoDB user: ${user}`);
  } else {
    targetDb.createUser({ user, pwd, roles });
    print(`Created MongoDB user: ${user}`);
  }
}

upsertUser(adminDb, 'leap_admin', adminPassword, [
  { role: 'clusterAdmin', db: 'admin' },
  { role: 'userAdminAnyDatabase', db: 'admin' },
  { role: 'dbAdmin', db: 'leap' },
]);

upsertUser(leapDb, 'leap_app', appPassword, [
  { role: 'readWrite', db: 'leap' },
]);

upsertUser(leapDb, 'leap_analytics', analyticsPassword, [
  { role: 'read', db: 'leap' },
]);

print('MongoDB native RBAC initialization complete.');

