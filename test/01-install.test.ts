import { AssertionError } from 'node:assert'

import { FetchMock } from '../src/index'

describe('Fetch Mock Installation', () => {
  let oldFetch: typeof globalThis.fetch

  beforeAll(() => void (oldFetch = globalThis.fetch))
  afterEach(() => void (globalThis.fetch = oldFetch))

  it('should install a mock fetch handler', () => {
    const handler = new FetchMock()
    expect(globalThis.fetch).toStrictlyEqual(oldFetch)

    handler.install()
    expect(globalThis.fetch).not.toStrictlyEqual(oldFetch)

    expect(handler).toHaveProperty('__fetch', expect.toStrictlyEqual(oldFetch))

    handler.destroy()
    expect(globalThis.fetch).toStrictlyEqual(oldFetch)
  })

  it('should not install a mock fetch handler more than once', () => {
    const handler1 = new FetchMock()
    const handler2 = new FetchMock()

    expect(() => handler1.install(), 'one').not.toThrow()
    expect(() => handler2.install(), 'two')
        .toThrowError(AssertionError, 'Global `fetch` already mocked')

    // installing the already-installed mock should work!
    expect(() => handler1.install(), 'three').not.toThrow()
  })

  it('should destroy when not installed', () => {
    new FetchMock().destroy()
  })

  it('should destroy only the correct instance when installed', () => {
    expect(() => new FetchMock().install()).not.toThrow()
    expect(() => new FetchMock().destroy())
        .toThrowError(AssertionError, 'Attempting to disable non-enabled mock instance')
  })
})
