import { FetchMock } from '../src/index'

describe('Multiple Fetch Mock Installation', () => {
  let oldFetch: typeof globalThis.fetch

  beforeAll(() => void (oldFetch = globalThis.fetch))
  afterEach(() => void (globalThis.fetch = oldFetch))

  it('should allow an existing mock to be wrapped', async () => {
    const handler1 = new FetchMock()
    const handler2 = new FetchMock()
    const handler3 = new FetchMock()

    handler1.on('GET', '/foo', (_) => new Response('FOO'))
    handler2.on('GET', '/bar', (_) => new Response('BAR'))
    handler3.on('GET', '/baz', (_) => new Response('BAZ'))

    handler1.install()
    handler2.install()
    handler3.install()

    await expect(fetch('/foo').then((r) => r.text())).toBeResolvedWith('FOO')
    await expect(fetch('/bar').then((r) => r.text())).toBeResolvedWith('BAR')
    await expect(fetch('/baz').then((r) => r.text())).toBeResolvedWith('BAZ')
    await expect(fetch('/abc').then((r) => r.status)).toBeResolvedWith(404)

    handler2.destroy() // destroy in the middle

    await expect(fetch('/foo').then((r) => r.text())).toBeResolvedWith('FOO')
    await expect(fetch('/bar').then((r) => r.status)).toBeResolvedWith(404)
    await expect(fetch('/baz').then((r) => r.text())).toBeResolvedWith('BAZ')
    await expect(fetch('/abc').then((r) => r.status)).toBeResolvedWith(404)

    handler3.destroy() // destroy at the top

    await expect(fetch('/foo').then((r) => r.text())).toBeResolvedWith('FOO')
    await expect(fetch('/bar').then((r) => r.status)).toBeResolvedWith(404)
    await expect(fetch('/baz').then((r) => r.status)).toBeResolvedWith(404)
    await expect(fetch('/abc').then((r) => r.status)).toBeResolvedWith(404)
  })
})
