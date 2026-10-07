import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, h, watch } from 'vue'
import { useHeaderScroll } from '../src/composables/useHeaderScroll.ts'

test('header and feed share one frame-batched listener and release it on unmount', () => {
  const previousWindow = globalThis.window
  const listeners = new Set()
  const frames = new Map()
  let nextFrame = 0
  globalThis.window = {
    scrollY: 0,
    addEventListener: (_event, callback) => listeners.add(callback),
    removeEventListener: (_event, callback) => listeners.delete(callback),
    requestAnimationFrame: callback => {
      frames.set(++nextFrame, callback)
      return nextFrame
    },
    cancelAnimationFrame: id => frames.delete(id)
  }
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null
  })
  const states = []
  const component = {
    setup() {
      states.push(useHeaderScroll())
      return () => h('div')
    }
  }
  const header = renderer.createApp(component)
  const feed = renderer.createApp(component)
  let stopWatch = () => {}
  try {
    header.mount({})
    feed.mount({})
    assert.equal(listeners.size, 1)
    const scroll = y => {
      window.scrollY = y
      listeners.forEach(callback => callback())
    }
    const flush = () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback())
    }
    for (let y = 70; y <= 100; y++) scroll(y)
    assert.equal(frames.size, 1)
    flush()
    assert.equal(states[0].isVisible.value, false)
    assert.equal(states[1].isNearTop.value, false)

    let updates = 0
    stopWatch = watch(() => [states[1].isVisible.value, states[1].isNearTop.value], () => updates++, { flush: 'sync' })
    scroll(200)
    flush()
    assert.equal(updates, 0, 'continued downward scrolling must not rerender feed tabs')
    scroll(150)
    flush()
    assert.equal(states[0].isVisible.value, true)
    scroll(0)
    flush()
    assert.equal(states[1].isNearTop.value, true)

    header.unmount()
    assert.equal(listeners.size, 1)
    scroll(100)
    feed.unmount()
    assert.equal(listeners.size, 0)
    assert.equal(frames.size, 0)
  } finally {
    stopWatch()
    globalThis.window = previousWindow
  }
})
