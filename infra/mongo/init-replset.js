/**
 * Initializes the 3-node MongoDB replica set `rs0`.
 * Idempotent: skips initiation if `rs.status()` already succeeds.
 */
try {
  const status = rs.status();
  if (status.ok === 1) {
    print('Replica set rs0 already initialized.');
    quit(0);
  }
} catch (_) {
  // Not initialized yet
}

const res = rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'mongo-1:27017', priority: 2 },
    { _id: 1, host: 'mongo-2:27017', priority: 1 },
    { _id: 2, host: 'mongo-3:27017', priority: 1 },
  ],
});

printjson(res);
