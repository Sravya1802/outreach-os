export async function streamSSE(url, options, onMessage) {
  const res = await fetch(url, { method: 'POST', ...options })
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value)
    const lines = buf.split('\n')
    buf = lines.pop()

    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5))
          onMessage(data)
        } catch (e) {
          console.warn('SSE parse error:', e)
        }
      }
    }
  }
}
