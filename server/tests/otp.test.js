process.env.NODE_ENV = 'test';
const request = require('supertest');
const { createApp } = require('../src/app');
const {
  OTP_MAX_ATTEMPTS,
  generateCode,
  hashCode,
  createOtpService,
} = require('../src/auth/otp');

function memoryOtpStore() {
  const rows = [];
  let seq = 1;
  return {
    rows,
    invalidateUnused: async (email, purpose, at) => {
      for (const r of rows) {
        if (r.email === email && r.purpose === purpose && r.usedAt === null) {
          r.usedAt = at;
        }
      }
    },
    create: async (doc) => {
      const rec = { _id: String(seq++), createdAt: new Date(), ...doc };
      rows.push(rec);
      return rec;
    },
    findLatestUnused: async (email, purpose) => {
      const matches = rows.filter((r) => r.email === email && r.purpose === purpose && r.usedAt === null);
      return matches.length ? matches[matches.length - 1] : null;
    },
    update: async (id, patch) => {
      const rec = rows.find((r) => r._id === id);
      if (rec) Object.assign(rec, patch);
    },
  };
}

describe('Email OTP helpers & service', () => {
  test('generateCode returns a 6-digit zero-padded string', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  test('hashCode normalizes email casing and separates purposes', () => {
    const a = hashCode('Learner@LEAP.dev', 'login_otp', '123456');
    const b = hashCode('learner@leap.dev', 'login_otp', '123456');
    const c = hashCode('learner@leap.dev', 'password_reset', '123456');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });

  test('issues, verifies once, and rejects replay', async () => {
    let clock = 1_700_000_000_000;
    const store = memoryOtpStore();
    const otp = createOtpService(store, { ttlMs: 600_000, now: () => clock });

    const { code, ttlMinutes } = await otp.issue({ email: 'asha@leap.dev', purpose: 'login_otp' });
    expect(ttlMinutes).toBe(10);
    expect(store.rows[0].codeHash).not.toBe(code);

    await otp.verify({ email: 'Asha@leap.dev', purpose: 'login_otp', code });
    await expect(otp.verify({ email: 'asha@leap.dev', purpose: 'login_otp', code }))
      .rejects.toMatchObject({ status: 400, code: 'OTP_EXPIRED' });
  });

  test('rejects expired codes', async () => {
    let clock = 1_700_000_000_000;
    const store = memoryOtpStore();
    const otp = createOtpService(store, { ttlMs: 60_000, now: () => clock });

    const { code } = await otp.issue({ email: 'asha@leap.dev', purpose: 'verify_email' });
    clock += 61_000;
    await expect(otp.verify({ email: 'asha@leap.dev', purpose: 'verify_email', code }))
      .rejects.toMatchObject({ status: 400, code: 'OTP_EXPIRED' });
  });

  test('locks OTP after max wrong attempts', async () => {
    const store = memoryOtpStore();
    const otp = createOtpService(store, { maxAttempts: OTP_MAX_ATTEMPTS });

    const { code } = await otp.issue({ email: 'asha@leap.dev', purpose: 'password_reset' });
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      await expect(otp.verify({ email: 'asha@leap.dev', purpose: 'password_reset', code: wrong }))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_OTP' });
    }
    // Once max attempts is reached, the OTP is burned and cannot be used even with the right code.
    await expect(otp.verify({ email: 'asha@leap.dev', purpose: 'password_reset', code }))
      .rejects.toMatchObject({ status: 400, code: 'OTP_EXPIRED' });
  });

  test('issuing a new OTP invalidates earlier unused OTPs for the same purpose', async () => {
    const store = memoryOtpStore();
    const otp = createOtpService(store);

    const first = await otp.issue({ email: 'asha@leap.dev', purpose: 'login_otp' });
    const second = await otp.issue({ email: 'asha@leap.dev', purpose: 'login_otp' });

    await expect(otp.verify({ email: 'asha@leap.dev', purpose: 'login_otp', code: first.code }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_OTP' });
    await otp.verify({ email: 'asha@leap.dev', purpose: 'login_otp', code: second.code });
  });
});

describe('OTP HTTP validation', () => {
  const app = createApp();

  test('POST /auth/otp/send validates email and purpose before touching DB', async () => {
    const badEmail = await request(app).post('/api/v1/auth/otp/send').send({ email: 'nope' });
    expect(badEmail.status).toBe(400);

    const badPurpose = await request(app).post('/api/v1/auth/otp/send').send({
      email: 'a@b.co', purpose: 'unknown',
    });
    expect(badPurpose.status).toBe(400);
    expect(badPurpose.body.error.code).toBe('INVALID_OTP_PURPOSE');
  });

  test('POST /auth/otp/verify rejects non-6-digit codes', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({
      email: 'a@b.co', code: '12ab', purpose: 'login_otp',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OTP');
  });

  test('POST /auth/reset-password-otp enforces password strength before OTP lookup', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password-otp').send({
      email: 'a@b.co', code: '123456', password: 'weak',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEAK_PASSWORD');
  });
});
