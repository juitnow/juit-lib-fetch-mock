import { FetchMock } from '../src'

describe('Fetch Interceptor', () => {
  let mock: FetchMock

  beforeAll(() => void (mock = new FetchMock().install()))
  afterAll(() => void mock.destroy())

  afterEach(() => void mock.reset())

  it('should fail', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.apple.com/')
    const p2 = fetch('https://www.google.com/')

    const r1 = await next()
    const r2 = await next()

    expect(r1.url).toStrictlyEqual('https://www.apple.com/')
    expect(r2.url).toStrictlyEqual('https://www.google.com/')

    r1.fail() // no error
    r2.fail(new TypeError('Hello, world!'))

    await expect(p1).toBeRejectedWithError('Error: https://www.apple.com/')
    await expect(p2).toBeRejectedWithError(TypeError, 'Hello, world!')
  })

  it('should fetch', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.juit.com/1')
    const p2 = fetch('https://www.juit.com/2')

    const r1 = await next()
    const r2 = await next()

    expect(r1.url).toStrictlyEqual('https://www.juit.com/1')
    expect(r2.url).toStrictlyEqual('https://www.juit.com/2')

    r1.fetch('https://www.apple.com/')
    r2.fetch('https://www.google.com/')

    const response1 = await p1
    const response2 = await p2

    expect(response1.status).toStrictlyEqual(200)
    expect(response2.status).toStrictlyEqual(200)

    expect(response1.url).toStrictlyEqual('https://www.apple.com/')
    expect(response2.url).toStrictlyEqual('https://www.google.com/')

    expect(await response1.text()).toMatch(/apple/mi)
    expect(await response2.text()).toMatch(/google/mi)
  })

  it('should send a response', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.apple.com/')
    const p2 = fetch('https://www.google.com/')

    const r1 = await next()
    const r2 = await next()

    r1.send()
    r2.send(new Response('google'))

    const response1 = await p1
    const response2 = await p2

    expect(response1.status).toStrictlyEqual(200)
    expect(response2.status).toStrictlyEqual(200)

    expect(await response1.text()).toStrictlyEqual('')
    expect(await response2.text()).toStrictlyEqual('google')
  })

  it('should send a status', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.apple.com/')
    const p2 = fetch('https://www.google.com/')
    const p3 = fetch('https://www.microsoft.com/')

    const r1 = await next()
    const r2 = await next()
    const r3 = await next()

    r1.sendStatus(200)
    r2.sendStatus(202)
    r3.sendStatus(418)

    const response1 = await p1
    const response2 = await p2
    const response3 = await p3

    expect(response1.status).toStrictlyEqual(200)
    expect(response2.status).toStrictlyEqual(202)
    expect(response3.status).toStrictlyEqual(418)

    expect(await response1.text()).toStrictlyEqual('')
    expect(await response2.text()).toStrictlyEqual('')
    expect(await response3.text()).toStrictlyEqual('')
  })

  it('should send some text', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.apple.com/')
    const p2 = fetch('https://www.google.com/')
    const p3 = fetch('https://www.microsoft.com/')

    const r1 = await next()
    const r2 = await next()
    const r3 = await next()

    r1.sendText('')
    r2.sendText('google')
    r3.sendText('microsoft', 404)

    const response1 = await p1
    const response2 = await p2
    const response3 = await p3

    expect(response1.status).toStrictlyEqual(200)
    expect(response2.status).toStrictlyEqual(200)
    expect(response3.status).toStrictlyEqual(404)

    expect(await response1.text()).toStrictlyEqual('')
    expect(await response2.text()).toStrictlyEqual('google')
    expect(await response3.text()).toStrictlyEqual('microsoft')
  })

  it('should send some json', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.apple.com/')
    const p2 = fetch('https://www.google.com/')
    const p3 = fetch('https://www.microsoft.com/')

    const r1 = await next()
    const r2 = await next()
    const r3 = await next()

    r1.sendJson([ 'apple' ], 599)
    r2.sendJson([ 'google', 1234567890 ])
    r3.sendJson({ microsoft: 'Hello, world!' })

    const response1 = await p1
    const response2 = await p2
    const response3 = await p3

    expect(response1.status).toStrictlyEqual(599)
    expect(response2.status).toStrictlyEqual(200)
    expect(response3.status).toStrictlyEqual(200)

    expect(await response1.json()).toEqual([ 'apple' ])
    expect(await response2.json()).toEqual([ 'google', 1234567890 ])
    expect(await response3.json()).toEqual({ microsoft: 'Hello, world!' })
  })

  it('should send some binary data', async () => {
    const next = mock.intercept()

    const p1 = fetch('https://www.apple.com/')
    const p2 = fetch('https://www.google.com/')
    const p3 = fetch('https://www.microsoft.com/')

    const r1 = await next()
    const r2 = await next()
    const r3 = await next()

    r1.sendData(Buffer.from('"apple"'), 599)
    r2.sendData(Buffer.from('"google"'))
    r3.sendData(Buffer.from('"microsoft"'))

    const response1 = await p1
    const response2 = await p2
    const response3 = await p3

    expect(response1.status).toStrictlyEqual(599)
    expect(response2.status).toStrictlyEqual(200)
    expect(response3.status).toStrictlyEqual(200)

    expect(await response1.json()).toEqual('apple')
    expect(await response2.json()).toEqual('google')
    expect(await response3.json()).toEqual('microsoft')
  })
})
