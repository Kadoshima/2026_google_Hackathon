/**
 * Basic smoke tests for the HTTP server.
 *
 * Run with: `node --test --import tsx dist/__tests__/smoke.test.js`
 * or after `npm run build`:
 *   node --test dist/__tests__/smoke.test.js
 *
 * These tests intentionally avoid touching Firestore / GCS / Vertex —
 * they verify the routing layer, middleware, CORS and error handling.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server.js'

const app = createApp()

const fetchApp = (path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://localhost${path}`, init))

test('GET /v1/healthz returns 200 ok', async () => {
  const res = await fetchApp('/v1/healthz')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, { status: 'ok' })
})

test('GET /v1/readyz returns 200 when not shutting down', async () => {
  const res = await fetchApp('/v1/readyz')
  assert.equal(res.status, 200)
  const body = (await res.json()) as { status: string }
  assert.equal(body.status, 'ready')
})

test('GET /v1/version returns service metadata', async () => {
  const res = await fetchApp('/v1/version')
  assert.equal(res.status, 200)
  const body = (await res.json()) as Record<string, unknown>
  assert.ok(typeof body.service === 'string')
  assert.ok(typeof body.version === 'string')
  assert.ok(typeof body.env === 'string')
})

test('Unknown route returns a structured 404', async () => {
  const res = await fetchApp('/v1/this-route-does-not-exist')
  assert.equal(res.status, 404)
  const body = (await res.json()) as { error: { code: string } }
  assert.equal(body.error.code, 'NOT_FOUND')
})

test('Response includes X-Request-Id header', async () => {
  const res = await fetchApp('/v1/healthz')
  const requestId = res.headers.get('x-request-id')
  assert.ok(requestId, 'expected x-request-id header to be present')
  assert.ok(requestId!.length > 0)
})

test('Server echoes provided X-Request-Id header', async () => {
  const sentinel = 'test-request-id-12345'
  const res = await fetchApp('/v1/healthz', {
    headers: { 'X-Request-Id': sentinel }
  })
  assert.equal(res.headers.get('x-request-id'), sentinel)
})

test('Security headers are present on responses', async () => {
  const res = await fetchApp('/v1/healthz')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.ok(res.headers.get('strict-transport-security'))
})

test('POST /v1/upload without multipart returns 400 INVALID_INPUT', async () => {
  const res = await fetchApp('/v1/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: { code: string } }
  assert.equal(body.error.code, 'INVALID_INPUT')
})

test('POST /v1/analyze with invalid JSON body returns 400', async () => {
  const res = await fetchApp('/v1/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json'
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: { code: string } }
  assert.equal(body.error.code, 'INVALID_INPUT')
})
