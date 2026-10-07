import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInFlightRequestPool } from '../src/utils/inFlightRequests.ts'

test('concurrent identical reads share one request; later reads fetch fresh data', async () => {
  const run = createInFlightRequestPool()
  let calls = 0
  let finish
  const request = () => {
    calls++
    return new Promise(resolve => { finish = resolve })
  }
  const first = run('/news', request)
  const second = run('/news', request)
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  finish('first response')
  assert.deepEqual(await Promise.all([first, second]), ['first response', 'first response'])
  assert.equal(await run('/news', async () => 'updated response'), 'updated response')
})

test('failed reads can be retried and do not poison future calls', async () => {
  const run = createInFlightRequestPool()
  await assert.rejects(run('/news', async () => { throw new Error('offline') }), /offline/)
  assert.equal(await run('/news', async () => 'recovered'), 'recovered')
})

test('different filters and detail IDs remain independent', async () => {
  const run = createInFlightRequestPool()
  const paths = ['/news?cursor=one', '/news?cursor=two', '/news/123']
  assert.deepEqual(await Promise.all(paths.map(path => run(path, async () => path))), paths)
})
