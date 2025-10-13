import { FetchMock } from '../src/index'

const mockSymbol = Symbol.for('juit.fetch.mock')

describe('Fetch Mock Installation', () => {
  let oldFetch: typeof globalThis.fetch

  beforeAll(() => void (oldFetch = globalThis.fetch))
  afterEach(() => void (globalThis.fetch = oldFetch))

  it('should install a mock fetch handler', () => {
    const handler = new FetchMock()
    expect(globalThis.fetch).toStrictlyEqual(oldFetch)

    handler.install()
    expect(globalThis.fetch).not.toStrictlyEqual(oldFetch)

    expect(handler).toHaveProperty('_fetch', expect.toStrictlyEqual(oldFetch))

    handler.destroy()
    expect(globalThis.fetch).toStrictlyEqual(oldFetch)
  })

  it('should wrap multiple mocks correctly', () => {
    const realFetch = globalThis.fetch
    const handler1 = new FetchMock()
    const handler2 = new FetchMock()
    const handler3 = new FetchMock()

    handler1.install()
    handler2.install()
    handler3.install()

    const nested3 = (globalThis.fetch as any)[mockSymbol]
    expect(nested3).toStrictlyEqual(handler3)
    const nested2 = nested3._fetch[mockSymbol]
    expect(nested2).toStrictlyEqual(handler2)
    const nested1 = nested2._fetch[mockSymbol]
    expect(nested1).toStrictlyEqual(handler1)

    // At the top of the chain, we should find the real fetch
    expect(nested1._fetch).toStrictlyEqual(realFetch)

    // Destroying should unwrap in reverse order
    handler3.destroy()
    expect((globalThis.fetch as any)[mockSymbol]).toStrictlyEqual(handler2)
    handler2.destroy()
    expect((globalThis.fetch as any)[mockSymbol]).toStrictlyEqual(handler1)
    handler1.destroy()
    expect(globalThis.fetch).toStrictlyEqual(realFetch)
  })

  it('should never allow a wrapped mock to be reinstalled', () => {
    const handler1 = new FetchMock()
    const handler2 = new FetchMock()
    const handler3 = new FetchMock()

    handler1.install()
    handler2.install()
    handler3.install()

    // Root mock can be reinstalled
    const mockedFn = globalThis.fetch
    expect(() => handler3.install()).not.toThrow()
    expect(globalThis.fetch).toStrictlyEqual(mockedFn)

    // Nested mocks cannot
    expect(() => handler2.install()).toThrowError(Error, 'Global `fetch` already mocked by this instance')
    expect(() => handler1.install()).toThrowError(Error, 'Global `fetch` already mocked by this instance')
  })


  it('should destroy when not installed', () => {
    new FetchMock().destroy()
  })

  it('should destroy only the correct instance when installed', () => {
    const realFetch = globalThis.fetch
    const handler1 = new FetchMock()
    const handler2 = new FetchMock()
    const handler3 = new FetchMock()

    handler1.install()
    handler2.install()
    handler3.install()

    const nested3 = (globalThis.fetch as any)[mockSymbol]
    expect(nested3).toStrictlyEqual(handler3)
    const nested2 = nested3._fetch[mockSymbol]
    expect(nested2).toStrictlyEqual(handler2)
    const nested1 = nested2._fetch[mockSymbol]
    expect(nested1).toStrictlyEqual(handler1)

    // At the top of the chain, we should find the real fetch
    expect(nested1._fetch).toStrictlyEqual(realFetch)

    // We unwrap the middle mock
    handler2.destroy()

    // The outermost mock is still in place
    const mocked3 = (globalThis.fetch as any)[mockSymbol]
    expect(mocked3).toStrictlyEqual(handler3)
    // mocked2 is gone
    const mocked1 = mocked3._fetch[mockSymbol]
    expect(mocked1).toStrictlyEqual(handler1)

    // Destroying an already-removed mock is a no-op (uninstall check)
    handler2.destroy()

    // At the top of the chain, we still find the real fetch
    expect(nested1._fetch).toStrictlyEqual(realFetch)

    // Destroying the outermost mock works as expected
    handler3.destroy()
    expect((globalThis.fetch as any)[mockSymbol]).toStrictlyEqual(handler1)
    expect((globalThis.fetch as any)[mockSymbol]._fetch).toStrictlyEqual(realFetch)

    // Destroying the last mock restores real fetch
    handler1.destroy()
    expect(globalThis.fetch).toStrictlyEqual(realFetch)

    // Destroying an already-removed mock is a no-op (global mock check)
    handler1.destroy()
    handler2.destroy()
    handler3.destroy()
  })
})
