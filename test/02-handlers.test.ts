import { FetchMock, sendData, sendJson, sendStatus, sendText } from '../src'

describe('Fetch Handlers and Responses', () => {
  let mock: FetchMock

  beforeAll(() => void (mock = new FetchMock('https://www.juit.com/').install()))
  afterAll(() => void mock.destroy())

  afterEach(() => void mock.reset())

  describe('Handlers', () => {
    it('should install a very simple handler', async () => {
      mock.handle(() => 599)

      const response = await fetch('http://www.juit.com/')
      expect(response.status).toStrictlyEqual(599)
    })

    it('should use handlers in order of installation', async () => {
      mock.handle(() => 499)
          .handle(() => 599)

      const response = await fetch('http://www.juit.com/')
      expect(response.status).toStrictlyEqual(499)
    })

    it('should handle requests for specific methods and paths', async () => {
      mock.on('GET', '/foo', () => 490)
          .on('GET', '/bar', () => 491)
          .on('POST', /foo/, () => 492)
          .on('POST', /bar/, () => 493)
          .on('PUT', /(foo|bar)/, () => 494)

      expect((await fetch('http://1111.juit.com/foo')).status).toStrictlyEqual(490)
      expect((await fetch('http://2222.juit.com/bar', { method: 'get' })).status).toStrictlyEqual(491)
      expect((await fetch('http://3333.juit.com/foo', { method: 'POST' })).status).toStrictlyEqual(492)
      expect((await fetch('http://4444.juit.com/bar', { method: 'post' })).status).toStrictlyEqual(493)
      expect((await fetch('http://www.example.org/abc/foo', { method: 'PUT' })).status).toStrictlyEqual(494)
      expect((await fetch('http://www.example.com/abc/bar', { method: 'PUT' })).status).toStrictlyEqual(494)
      expect((await fetch('http://www.google.com/')).status).toStrictlyEqual(404)
    })

    it('should resolve the base url for releative requests', async () => {
      let status = 432
      let request: Request | undefined = undefined
      mock.handle((req) => {
        request = req
        return status ++
      })

      expect(await fetch('/foo')).toHaveProperty('status', expect.toStrictlyEqual(432))

      expect(request).toBeA('object',
          expect.toHaveProperty('url',
              expect.toStrictlyEqual('https://www.juit.com/foo')))

      expect(await fetch('http://www.google.com')).toHaveProperty('status', expect.toStrictlyEqual(433))

      expect(request).toBeA('object',
          expect.toHaveProperty('url',
              expect.toStrictlyEqual('http://www.google.com/')))

      expect(await fetch(request!)).toHaveProperty('status', expect.toStrictlyEqual(434))

      expect(request).toBeA('object',
          expect.toHaveProperty('url',
              expect.toStrictlyEqual('http://www.google.com/')))
    })
  })

  describe('Responses', () => {
    it('should respond with a status', async () => {
      mock.handle(() => sendStatus(404))

      expect(await fetch('http://www.google.com/')).toInclude({
        statusText: 'Not Found',
        status: 404,
      })
    })

    it('should respond with a status code and text', async () => {
      mock.handle(() => sendStatus(486, 'Hello World!'))

      expect(await fetch('http://www.google.com/')).toInclude({
        statusText: 'Hello World!',
        status: 486,
      })
    })

    it('should respond with some text', async () => {
      mock.handle(() => sendText('Hello, world', 404))

      const response = await fetch('http://www.google.com/')

      expect(response).toInclude({
        statusText: 'Not Found',
        status: 404,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => headers[key] = value)
      expect(headers).toEqual({
        'content-type': 'text/plain; charset=utf-8',
      })

      expect(await response.text()).toEqual('Hello, world')
    })

    it('should respond with some json', async () => {
      mock.handle(() => sendJson({ hello: 'world' }, 302))

      const response = await fetch('http://www.google.com/')

      expect(response).toInclude({
        statusText: 'Found',
        status: 302,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => headers[key] = value)
      expect(headers).toEqual({
        'content-type': 'application/json; charset=utf-8',
      })

      expect(await response.json()).toEqual({ hello: 'world' })
    })

    it('should respond with some binary data', async () => {
      mock.handle(() => sendData(Buffer.from('Hello, world'), 500))

      const response = await fetch('http://www.google.com/')

      expect(response).toInclude({
        statusText: 'Internal Server Error',
        status: 500,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => headers[key] = value)
      expect(headers).toEqual({
        'content-type': 'application/octet-stream',
      })

      expect(await response.text()).toEqual('Hello, world')
    })
  })
})
