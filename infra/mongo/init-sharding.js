/**
 * Initializes sharding on the `leap` database via `mongos`:
 *   - Adds shard1Rs and shard2Rs
 *   - Enables sharding on `leap`
 *   - Configures hashed shard keys on high-volume collections
 */
sh.addShard('shard1Rs/shard1:27018');
sh.addShard('shard2Rs/shard2:27018');

sh.enableSharding('leap');

// High-volume learner event & recommendation collections sharded by userId
sh.shardCollection('leap.interactions', { userId: 'hashed' });
sh.shardCollection('leap.recommendations', { userId: 'hashed' });
sh.shardCollection('leap.contentitems', { _id: 'hashed' });

print('Sharding configured for leap database:');
printjson(sh.status());
