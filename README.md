Mocking `fetch` in NodeJS
=========================

This package allows to quicly mock the global `fetch` distributed with Node 18
(and greater).

* [Request Handlers](#request-handlers)
* [Request Interception](#request-interception)
* [License](LICENSE.md)
* [Copyright](NOTICE.md)


### Request Handlers

To mock requests to be handled with either the `handle(...)` or `on(...)`
methods exposed by the `FetchMock` class. An example:

```ts
import { FetchMock } from '@juit/lib-fetch-mock'

it('should always return 599', async () => {
  const mock = new FetchMock().install()

  mock.handle((request: Request) => {
    return new Response(null, { status: 599 })
  })

  const response = await fetch('https://www.google.com/')
  expect(response.status).toEqual(599)
})
```

We can also mock individual HTTP calls, by using `on(...)` with a _method_ and
path (either matched by `string` or `RegExp`):

```ts
import { FetchMock } from '@juit/lib-fetch-mock'

it('should always return 404', async () => {
  const mock = new FetchMock().install()

  mock.on('GET', '/foo', (request: Request) => 200)
      .on('POST', /bar/, (request: Request) => 302)

  expect((await fetch('https://www.google.com/foo')).status).toEqual(200)
  expect((await fetch('https://www.apple.com/bar')).status).toEqual(302)
  expect((await fetch('https://www.microsoft.com')).status).toEqual(404) // default!
})
```

The second parameter to the callback for `handle(...)` or `on(...)` is always
a _real_ `fetch` method, allowing to interact with the network.

The functions `sendStatus(...)`, `sendJson(...)`, `sendText(...)` and
`sendData(...)` can be used to generate simple responses for mocking.


### Request Interception

As in some case it's easier to _await_ in tests for a specific request (rather
than constructing a whole interceptor handling multiple cases) the function
`interceptor()` gives access to a pseudo-iterator for `Request`s.

An example:

```ts
import { FetchMock } from '@juit/lib-fetch-mock'

it('should await on some requests', async () => {
  const mock = new FetchMock().install()
  const next = mock.intercept() // our interceptor!

  // Don't _await_ on this, it'll be responded to below
  const promise = fetch('https://www.apple.com/')

  // Here "request" is the `Request` associated with the request above
  const request = await next()

  // Obviously, we can inspect the whole request, url, headers, body, ...
  expect(request.url).toEqual('https://www.apple.com/')

  // Now we can _respond_ to our request, with a `Response`, json, ...
  request.sendJson({ apple: 'and banana' })

  // Here the promise to the request is resolved, sooo..
  const response = await promise

  expect(response.status).toEqual(200)
  expect(await response.json()).toEqual({ apple: 'and banana' })
})
```

The `DeferredResponse` returned by the interceptor (`next()` in the example
above) exposes few methods to easily create responses:

* `fail: (error?: Error) => void` \
  Fail the `Request` with an optional `Error`.
* `fetch: (...args: FetchArguments) => void` \
  Respond to this intercepted request with a _real_ `fetch` request.
* `send: (response?: Response | PromiseLike<Response>) => void` \
  Respond to the `Request` with an optional `Response` (defaults to a `200 Ok`
  response with no/empty body).
* `sendStatus: (status: number, statusText?: string) => void` \
  Respond to the `Request` only with the specified status and an empty body,
  the status text can optionally be specified, as well
* `sendJson: (json: any, status?: number) => void`
  Respond to the `Request` only with the specified JSON body and an optional
  status code.
* `sendText: (text: string, status?: number) => void`
  Respond to the `Request` only with the specified text body and an optional
  status code.
* `sendData: (data: Uint8Array, status?: number) => void`
  Respond to the `Request` only with the specified binary body and an optional
  status code.
