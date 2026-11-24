/**
 * Unit tests for MongoDB topology detection (standalone, replicaSet, sharded)
 * and readPreference configuration.
 */
process.env.NODE_ENV = 'test';
const config = require('../src/config');
const db = require('../src/db');

describe('db topology & readPreference', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('defaults mongoReadPreference to primaryPreferred', () => {
    expect(config.mongoReadPreference).toBe('primaryPreferred');
  });

  test('getTopology reports disconnected when mongoose is not connected', async () => {
    expect(await db.getTopology()).toEqual({ mode: 'disconnected' });
  });

  test('getTopology detects standalone, replicaSet, and sharded topologies', async () => {
    const adminMock = { command: jest.fn() };
    jest.spyOn(db.mongoose, 'connection', 'get').mockReturnValue({
      readyState: 1,
      db: { admin: () => adminMock },
    });

    // Standalone
    adminMock.command.mockResolvedValueOnce({ ok: 1 });
    expect(await db.getTopology()).toEqual({ mode: 'standalone' });

    // Replica Set
    adminMock.command
      .mockResolvedValueOnce({ setName: 'rs0', primary: 'mongo-1:27017' })
      .mockResolvedValueOnce({
        set: 'rs0',
        members: [
          { name: 'mongo-1:27017', stateStr: 'PRIMARY', health: 1 },
          { name: 'mongo-2:27017', stateStr: 'SECONDARY', health: 1 },
          { name: 'mongo-3:27017', stateStr: 'SECONDARY', health: 1 },
        ],
      });
    const rs = await db.getTopology();
    expect(rs.mode).toBe('replicaSet');
    expect(rs.setName).toBe('rs0');
    expect(rs.members).toHaveLength(3);

    // Sharded (mongos)
    adminMock.command
      .mockResolvedValueOnce({ msg: 'isdbgrid' })
      .mockResolvedValueOnce({
        shards: [
          { _id: 'shard1Rs', host: 'shard1Rs/shard1:27018', state: 1 },
          { _id: 'shard2Rs', host: 'shard2Rs/shard2:27018', state: 1 },
        ],
      });
    const sh = await db.getTopology();
    expect(sh.mode).toBe('sharded');
    expect(sh.shards).toHaveLength(2);
  });
});
