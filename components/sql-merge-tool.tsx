"use client"

import { useMemo, useState } from "react"

type MergeResult = {
  result: string
  error?: string
  usedCount: number
  placeholderCount: number
}

function escapeSqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE"
  // Dates or other toString-able types handled as strings
  const s = String(v)
  // Double the single quotes inside the string: O'Reilly -> O''Reilly
  const escaped = s.replace(/'/g, "''")
  return `'${escaped}'`
}

function countPlaceholders(sql: string): number {
  let inSingle = false
  let inDouble = false
  let inBack = false
  let count = 0
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (!inDouble && !inBack && ch === "'") {
      // Enter/exit single quote; handle escaped '' inside singles
      if (inSingle && next === "'") {
        i++ // skip escaped quote
        continue
      }
      inSingle = !inSingle
      continue
    }

    if (!inSingle && !inBack && ch === '"') {
      if (inDouble && next === '"') {
        i++
        continue
      }
      inDouble = !inDouble
      continue
    }

    if (!inSingle && !inDouble && ch === "`") {
      if (inBack && next === "`") {
        i++
        continue
      }
      inBack = !inBack
      continue
    }

    if (!inSingle && !inDouble && !inBack && ch === "?") {
      count++
    }
  }
  return count
}

function mergeSql(sql: string, params: unknown[]): MergeResult {
  let inSingle = false
  let inDouble = false
  let inBack = false
  let out = ""
  let pi = 0

  const placeholderCount = countPlaceholders(sql)

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (!inDouble && !inBack && ch === "'") {
      if (inSingle && next === "'") {
        out += "''"
        i++
        continue
      }
      inSingle = !inSingle
      out += ch
      continue
    }

    if (!inSingle && !inBack && ch === '"') {
      if (inDouble && next === '"') {
        out += '""'
        i++
        continue
      }
      inDouble = !inDouble
      out += ch
      continue
    }

    if (!inSingle && !inDouble && ch === "`") {
      if (inBack && next === "`") {
        out += "``"
        i++
        continue
      }
      inBack = !inBack
      out += ch
      continue
    }

    if (!inSingle && !inDouble && !inBack && ch === "?") {
      if (pi >= params.length) {
        // Not enough params; leave '?' and report error at end
        out += "?"
      } else {
        out += escapeSqlValue(params[pi++])
      }
      continue
    }

    out += ch
  }

  if (pi < params.length) {
    return {
      result: out,
      error: `Too many parameters: provided ${params.length}, used ${pi}.`,
      usedCount: pi,
      placeholderCount,
    }
  }
  if (pi < placeholderCount) {
    return {
      result: out,
      error: `Not enough parameters: placeholders=${placeholderCount}, provided=${params.length}.`,
      usedCount: pi,
      placeholderCount,
    }
  }
  return { result: out, usedCount: pi, placeholderCount }
}

export default function SqlMergeTool() {
  const [sql, setSql] = useState<string>("SELECT * FROM abc WHERE abc.id = ? AND abc.anotherId IN (?, ?)")
  const [paramsText, setParamsText] = useState<string>('["784", 123, 456]')
  const [merged, setMerged] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [copied, setCopied] = useState<boolean>(false)

  const placeholderCount = useMemo(() => countPlaceholders(sql), [sql])

  function parseParams(text: string): unknown[] | { error: string } {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        return { error: "Parameters input must be a JSON array." }
      }
      return parsed
    } catch (e) {
      return { error: 'Invalid JSON. Ensure it\'s a valid array like: ["784", 123, 456]' }
    }
  }

  const onMerge = () => {
    setCopied(false)
    const parsed = parseParams(paramsText)
    if (Array.isArray(parsed)) {
      const r = mergeSql(sql, parsed)
      setMerged(r.result)
      setError(r.error || "")
    } else {
      setMerged("")
      setError(parsed.error)
    }
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(merged)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const onLoadExample = () => {
    setSql("SELECT * FROM abc WHERE abc.id = ? AND abc.anotherId IN (?, ?)")
    setParamsText('["784", 123, 456]')
    setMerged("")
    setError("")
    setCopied(false)
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <label htmlFor="sql" className="text-sm font-medium text-foreground">
          SQL with {"'?'"} placeholders
        </label>
        <textarea
          id="sql"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={6}
          className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-describedby="sql-help"
          spellCheck={false}
        />
        <div id="sql-help" className="text-xs text-muted-foreground">
          Placeholders outside quotes will be replaced. Example:{" "}
          {"SELECT * FROM abc WHERE id = ? AND anotherId IN (?, ?)"}
        </div>
        <div className="text-xs text-muted-foreground">
          Detected placeholders: <span className="font-medium text-foreground">{placeholderCount}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="params" className="text-sm font-medium text-foreground">
          Parameters (JSON array)
        </label>
        <textarea
          id="params"
          value={paramsText}
          onChange={(e) => setParamsText(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-describedby="params-help"
          spellCheck={false}
        />
        <div id="params-help" className="text-xs text-muted-foreground">
          Example: {'["784", 123, 456]'} — strings will be single-quoted and escaped, numbers left as-is.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onMerge}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Merge
        </button>
        <button
          type="button"
          onClick={onLoadExample}
          className="inline-flex items-center rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Load Example
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={!merged}
          className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy Output"}
        </button>
      </div>

      <div className="grid gap-2">
        <label htmlFor="output" className="text-sm font-medium text-foreground">
          Output (merged SQL)
        </label>
        <textarea
          id="output"
          value={merged}
          readOnly
          rows={5}
          className="w-full resize-y rounded-md border border-input bg-muted p-3 text-sm text-foreground/90"
          placeholder="Merged SQL will appear here"
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : merged ? (
          <p className="text-xs text-muted-foreground">Merge completed successfully.</p>
        ) : null}
      </div>
    </section>
  )
}
