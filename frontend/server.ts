import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ViteDevServer } from 'vite'
import type { RenderResult } from './src/rendering.ts'

const production = process.argv.includes('--production')
const root = import.meta.dirname
const clientRoot = resolve(root, 'dist/client')
const port = Number(process.env.PORT ?? (production ? 4173 : 5173))
const host = process.env.HOST ?? '127.0.0.1'
const contentTypes: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

let vite: ViteDevServer | undefined
let productionTemplate = ''
let productionRender: ((url: string) => RenderResult) | undefined

function send(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(body)
}

async function serveAsset(request: IncomingMessage, response: ServerResponse, pathname: string) {
  const file = resolve(clientRoot, `.${decodeURIComponent(pathname)}`)
  if (!file.startsWith(`${clientRoot}${sep}`)) return send(response, 404, 'Not found')

  try {
    const body = await readFile(file)
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'EISDIR') {
      send(response, 404, 'Not found')
    } else {
      throw error
    }
  }
}

async function handlePage(request: IncomingMessage, response: ServerResponse) {
  try {
    const url = request.url ?? '/'
    let pathname: string
    try {
      if (!url.startsWith('/') || url.startsWith('//')) throw new URIError('Invalid request target')
      pathname = new URL(url, 'http://localhost').pathname
      if (decodeURIComponent(pathname).includes('\0')) throw new URIError('Invalid path')
    } catch {
      send(response, 400, 'Bad request')
      return
    }
    if (production && (pathname.startsWith('/assets/') || pathname === '/favicon.svg')) {
      await serveAsset(request, response, pathname)
      return
    }

    const template = vite
      ? await vite.transformIndexHtml(url, await readFile(resolve(root, 'index.html'), 'utf-8'))
      : productionTemplate
    const render: (url: string) => RenderResult = vite
      ? (await vite.ssrLoadModule('/src/entry-server.tsx')).render
      : productionRender!
    const result = render(url)
    if (result.redirect) {
      response.writeHead(result.status, { Location: result.redirect })
      response.end()
      return
    }

    response.writeHead(result.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(request.method === 'HEAD' ? undefined : template.replace('<!--ssr-outlet-->', () => result.html))
  } catch (error) {
    vite?.ssrFixStacktrace(error as Error)
    console.error(error)
    send(response, 500, 'Unable to render this page')
  }
}

const server = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    send(response, 405, 'Method not allowed')
    return
  }
  if (vite) vite.middlewares(request, response, () => { void handlePage(request, response) })
  else void handlePage(request, response)
})

if (production) {
  productionTemplate = await readFile(resolve(clientRoot, 'index.html'), 'utf-8')
  productionRender = (await import(pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href)).render
} else {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  })
}

server.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
  void vite?.close()
})
server.listen(port, host, () => console.log(`Taramisu ${production ? 'production' : 'dev'} SSR: http://${host}:${port}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void vite?.close().finally(() => server.close())
    if (!vite) server.close()
  })
}
