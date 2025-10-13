import assert from 'node:assert'
import { STATUS_CODES } from 'node:http'

const mockSymbol = Symbol.for('juit.fetch.mock')

type FetchFunction = typeof globalThis.fetch
type FetchArguments = Parameters<FetchFunction>
type MaybeMockedFetchFunction = FetchFunction & { [mockSymbol]?: FetchMockImpl }

type FetchHandlerResult = Response | number | void | null | undefined
type FetchHandler = (request: Request, fetch: FetchFunction) => FetchHandlerResult | Promise<FetchHandlerResult>


// This is an interesting bug somewhere: when using _fetch_ a number of times
// (the real _fetch_), some resources are left open and the testing framework
// never exits.
//
// ON MAC, if we only keep a _hard reference_ to resources (and to the
// created `Response` objects) until the tests end (see `process.on("exit")`
// below) then everything exits gracefully...
//
// ON LINUX, on the other hand, things simply "hang"
//
// I don't like the current "process.exit()" solution, but somehow it seems
// to be the only workable option across platforms...
process.on('exit', () => process.exit(process.exitCode))

/* ========================================================================== *
 * FETCH MOCK IMPLEMENTATION                                                  *
 * ========================================================================== */

export interface FetchMock {
  /** Handle requests a specific method and path with the specified handler callback */
  on(method: string, path: string | RegExp, handler: FetchHandler): this
  /** Handle all requests with the specified handler callback */
  handle(handler: FetchHandler): this
  /** Intercept mocked requests with an interceptor */
  intercept(): () => Promise<DeferredRequest>
  /** Reset all handlers and interceptors for this instance */
  reset(): this

  /** Install this instance as the global `fetch` mock handler */
  install(): this
  /** Ensure that the mocked `fetch` is restored to its original value */
  destroy(): void
}

export interface FetchMockConstructor {
  /**
   * Create a new {@link FetchMock} instance, optionally resolving relative
   * request URLs against the specified _base url_.
   */
  new (baseurl?: string | URL | undefined): FetchMock
}

class FetchMockImpl implements FetchMock {
  private _handlers: FetchHandler[] = []
  private _fetch?: MaybeMockedFetchFunction
  private _baseurl: URL

  constructor(baseurl?: string | URL | undefined) {
    this._baseurl = new URL(baseurl || 'http://test/')
  }

  /* === FETCH ============================================================== */

  private async $fetch(
      info: URL | RequestInfo,
      init?: RequestInit | undefined,
  ): Promise<Response> {
    assert(this._fetch, 'Global `fetch` not available (mock not enabled?)')

    // This has to do with async hooks and resources... By wrapping the real
    // fetch, we create a new promise (a new resource) associated with the
    // current async context... If we don't do this, sometimes, the process
    // won't exit waiting for _something_ (dunno what, yet)!
    const realFetch = this._fetch
    const fetchWrapper = (
        info: URL | RequestInfo,
        init?: RequestInit | undefined,
    ): Promise<Response> => realFetch.call(globalThis, info, init)

    let response: Response | undefined = undefined

    for (const handler of this._handlers) {
      const request = (info instanceof URL) || (typeof info === 'string') ?
        new Request(new URL(info, this._baseurl), init) :
        new Request(info.clone(), init)

      const result = await handler(request, fetchWrapper)
      if ((result === undefined) || (result === null)) continue

      response = (typeof result === 'number') ? sendStatus(result) : result
      break
    }

    // If we have a response from this mock, return it
    if (response) return response

    // If we are wrapping another mock, call it
    if (this._fetch[mockSymbol]) {
      return this._fetch[mockSymbol].$fetch(info, init)
    }

    // Otherwise, return not found (404)
    return sendStatus(404)
  }

  /* === HANDLERS =========================================================== */

  on(method: string, path: string | RegExp, handler: FetchHandler): this {
    this._handlers.push((request, fetch) => {
      if (request.method !== method.toUpperCase()) return

      const pathname = new URL(request.url).pathname
      if (((typeof path === 'string') && (path === pathname)) ||
          ((path instanceof RegExp) && pathname.match(path))) {
        return handler(request, fetch)
      }
    })

    return this
  }

  handle(handler: FetchHandler): this {
    this._handlers.push(handler)
    return this
  }

  reset(): this {
    this._handlers = []
    return this
  }

  /* === INTERCEPTOR ======================================================== */

  intercept(): () => Promise<DeferredRequest> {
    const queue: Deferred<DeferredRequest>[] = []
    queue.push(new Deferred<DeferredRequest>())

    const next: () => Promise<DeferredRequest> = () => {
      return new Promise<DeferredRequest>((resolve, reject) => {
        queue[0]!.promise.then((request) => {
          queue.splice(0, 1)
          resolve(request)
        }, reject)
      })
    }

    this._handlers.push((request: Request, fetch: FetchFunction): Promise<Response> => {
      queue.push(new Deferred<DeferredRequest>())

      const deferredResponse = new Deferred<Response>()
      const deferredRequest = new DeferredRequestImpl(request, deferredResponse, fetch)
      queue[queue.length - 2]!.resolve(deferredRequest)
      return deferredResponse.promise
    })

    return next
  }

  /* === INSTALL / DESTROY ================================================== */

  install(): this {
    // Ignore this if we are already installed at the root of the mock chain
    if (mockSymbol in globalThis.fetch) {
      if ((globalThis as any).fetch[mockSymbol] === this) return this
    }

    // If we are already installed somewhere in the mock chain, fail
    let fn: MaybeMockedFetchFunction | undefined = globalThis.fetch
    while (fn && fn[mockSymbol]) {
      if (fn[mockSymbol] === this) {
        throw new Error('Global `fetch` already mocked by this instance')
      } else {
        fn = fn[mockSymbol]._fetch
      }
    }

    // Save the current fetch (either the real one, or another mock)
    this._fetch = globalThis.fetch

    // Install our fetch handler
    globalThis.fetch = this.$fetch.bind(this)
    Object.defineProperty(globalThis.fetch, mockSymbol, { value: this })
    return this
  }

  destroy(): void {
    // If we're not mocked *globally*, just return
    if (! (mockSymbol in globalThis.fetch)) return

    // If we have never been installed, do nothing
    if (! this._fetch) return

    // Start looking into our chain of mocks
    let parent: FetchMockImpl | undefined = undefined
    let fn = globalThis.fetch as MaybeMockedFetchFunction

    // Walk the chain of mocks until we find ourselves
    while (fn[mockSymbol]) {
      if (fn[mockSymbol] === this) {
        if (! parent) globalThis.fetch = this._fetch
        else parent._fetch = this._fetch
        break
      } else {
        parent = fn[mockSymbol]
        fn = fn[mockSymbol]._fetch as MaybeMockedFetchFunction
      }
    }

    // Forget our saved fetch
    this._fetch = undefined
  }
}

export const FetchMock: FetchMockConstructor = FetchMockImpl

/* ========================================================================== *
 * DEFERRED REQUESTS                                                          *
 * ========================================================================== */

/**
 * A `DeferredRequest` is an utility class deferring the `Response` sent for
 * an _intercepted_ `Request`.
 */
export interface DeferredRequest extends Readonly<Request> {
  /** Fail the `Request` with an optional `Error` */
  readonly fail: (error?: Error) => void,
  /** Respond to this intercepted request with a _real_ `fetch` request */
  readonly fetch: (...args: FetchArguments) => void,
  /** Respond to the `Request` with an optional `Response` (defaults to an empty 200 `Response`) */
  readonly send: (response?: Response | PromiseLike<Response>) => void,
  /** Respond to the `Request` with the specified status and an empty body */
  readonly sendStatus: (status: number) => void,
  /** Respond to the `Request` with the specified JSON body and an optional status */
  readonly sendJson: (json: any, status?: number) => void,
  /** Respond to the `Request` with the specified text body and an optional status */
  readonly sendText: (text: string, status?: number) => void,
  /** Respond to the `Request` with the specified binary body and an optional status */
  readonly sendData: (data: Uint8Array, status?: number) => void,
}

/**
 * A `Deferred` exposes a `Promise`, its `resolve()` and `reject()` functions.
 */
class Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (resolution: T | PromiseLike<T>) => void
  readonly reject: (failure: Error) => void

  constructor() {
    let resolve!: (resolution: T | PromiseLike<T>) => void
    let reject!: (failure: Error) => void

    this.promise = new Promise<T>((resolver, rejector) => {
      resolve = resolver
      reject = rejector
    })

    this.resolve = resolve
    this.reject = reject
  }
}

/** Implementation of the `DeferredRequest` interface. */
class DeferredRequestImpl extends Request implements DeferredRequest {
  constructor(
      request: Request,
      private readonly _deferred: Deferred<Response>,
      private readonly _fetch: FetchFunction,
  ) {
    super(request)
  }

  fail(failure?: Error): void {
    this._deferred.reject(failure || new Error(`Error: ${this.url}`))
  }

  fetch(...args: FetchArguments): void {
    this._deferred.resolve(this._fetch(...args))
  }

  send(response?: Response | PromiseLike<Response>): void {
    this._deferred.resolve(response || new Response())
  }

  sendStatus(status: number): void {
    this._deferred.resolve(sendStatus(status))
  }

  sendText(text: string, status: number = 200): void {
    this._deferred.resolve(sendText(text, status))
  }

  sendJson(json: any, status: number = 200): void {
    this._deferred.resolve(sendJson(json, status))
  }

  sendData(data: Uint8Array, status = 200): void {
    this._deferred.resolve(sendData(data, status))
  }
}

/* ========================================================================== *
 * EASY RESPONSES                                                             *
 * ========================================================================== */

/** Create a `Response` with the specified status and an empty body */
export function sendStatus(
    status: number,
    statusText = STATUS_CODES[status],
): Response {
  return new Response(undefined, { status, statusText })
}

/** Create a `Response` with the specified text body and an optional status */
export function sendText(text: string, status = 200): Response {
  return new Response(text, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    statusText: STATUS_CODES[status],
    status,
  })
}

/** Create a `Response` with the specified JSON body and an optional status */
export function sendJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    statusText: STATUS_CODES[status],
    status,
  })
}

/** Create a `Response` with the specified binary body and an optional status */
export function sendData(data: Uint8Array, status = 200): Response {
  return new Response(Buffer.from(data), {
    headers: { 'content-type': 'application/octet-stream' },
    statusText: STATUS_CODES[status],
    status,
  })
}
