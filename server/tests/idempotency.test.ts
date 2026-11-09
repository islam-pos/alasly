import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { OfflineMutationReceipt } from '@prisma/client';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../src/middleware/auth';
import { createIdempotencyMiddleware } from '../src/middleware/idempotency';

type ReceiptFields = {
  userId: string;
  key: string;
  requestHash: string;
  status: string;
  responseStatus: number | null;
  responseBody: string | null;
};

class MemoryReceiptStore {
  private readonly records = new Map<string, ReceiptFields>();

  async findByKey(userId: string, key: string): Promise<OfflineMutationReceipt | null> {
    const record = this.records.get(`${userId}:${key}`);
    return record ? record as unknown as OfflineMutationReceipt : null;
  }

  async create(record: { userId: string; key: string; requestHash: string; status: string }): Promise<void> {
    this.records.set(`${record.userId}:${record.key}`, {
      ...record,
      responseStatus: null,
      responseBody: null,
    });
  }

  async update(
    userId: string,
    key: string,
    update: { status: string; responseStatus: number; responseBody: string | null },
  ): Promise<void> {
    const record = this.records.get(`${userId}:${key}`);
    if (record) Object.assign(record, update);
  }

  size() {
    return this.records.size;
  }
}

class TestResponse extends EventEmitter {
  statusCode = 200;
  body: unknown;
  headers = new Map<string, string>();

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: unknown) {
    this.body = body;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }

  type(value: string) {
    this.setHeader('content-type', value);
    return this;
  }

  send(body: unknown) {
    this.body = body;
    return this;
  }

  end() {
    return this;
  }
}

const createRequest = (
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'idempotency-key': 'operation-1' },
  method = 'POST',
) => ({
  method,
  originalUrl: '/api/master/customers',
  body,
  user: { id: 'user-1', username: 'admin', role: 'admin' },
  header: (name: string) => headers[name.toLowerCase()],
}) as unknown as AuthenticatedRequest;

const waitForReceiptWrite = () => new Promise<void>((resolve) => setImmediate(resolve));

test('completed requests replay the stored result without running the mutation again', async () => {
  const receipts = new MemoryReceiptStore();
  const middleware = createIdempotencyMiddleware(receipts);
  const request = createRequest({ name: 'Customer' });
  const firstResponse = new TestResponse();
  let nextCalls = 0;

  await middleware(request, firstResponse as unknown as Response, () => { nextCalls += 1; });
  firstResponse.status(201).json({ id: 'customer-1' });
  firstResponse.emit('finish');
  await waitForReceiptWrite();

  const replayResponse = new TestResponse();
  await middleware(request, replayResponse as unknown as Response, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
  assert.equal(replayResponse.statusCode, 201);
  assert.equal(replayResponse.body, JSON.stringify({ id: 'customer-1' }));
  assert.equal(replayResponse.headers.get('Idempotency-Replayed'), 'true');
});

test('a key cannot be reused with a different request body', async () => {
  const receipts = new MemoryReceiptStore();
  const middleware = createIdempotencyMiddleware(receipts);
  const firstResponse = new TestResponse();
  await middleware(createRequest({ name: 'First' }), firstResponse as unknown as Response, () => {});

  const replayResponse = new TestResponse();
  let nextCalls = 0;
  await middleware(createRequest({ name: 'Different' }), replayResponse as unknown as Response, () => { nextCalls += 1; });

  assert.equal(replayResponse.statusCode, 409);
  assert.deepEqual(replayResponse.body, { error: 'مفتاح العملية مستخدم مسبقاً لبيانات مختلفة.' });
  assert.equal(nextCalls, 0);
});

test('offline edits require explicit review before reaching the mutation handler', async () => {
  const receipts = new MemoryReceiptStore();
  const middleware = createIdempotencyMiddleware(receipts);
  const request = createRequest({ name: 'Updated' }, {
    'idempotency-key': 'operation-2',
    'x-autocare-offline': '1',
  }, 'PATCH');
  const response = new TestResponse();
  let nextCalls = 0;

  await middleware(request, response as unknown as Response, () => { nextCalls += 1; });

  assert.equal(response.statusCode, 409);
  assert.equal(nextCalls, 0);
  assert.equal(receipts.size(), 0);
});
