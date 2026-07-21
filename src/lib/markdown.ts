export function preprocessMarkdown(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let prevLineIsItem = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const trimmed = line.trimStart()

    if (/^[-*]/.test(trimmed)) {
      if (!prevLineIsItem && result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      line = line.replace(/^(\s*)[-*]\s*/, '$1- ')
      prevLineIsItem = true
    } else {
      prevLineIsItem = false
    }

    result.push(line)
  }

  return result.join('\n')
}
