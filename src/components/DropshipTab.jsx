import React, { useState, useRef, useMemo, useCallback } from 'react'
import { PDFDocument, rgb } from 'pdf-lib'

let did = 1

const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem('dropship_settings') || '{}') }
  catch { return {} }
}

// Content fingerprint of a PDF's bytes (FNV-1a 32-bit + length) so the same
// label file uploaded twice is recognized as a duplicate.
const fileSig = (bytes) => {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return bytes.length + ':' + h.toString(16)
}

// Split a typed SKU into its base product code and quantity, e.g.
// "S26-ULTRA-512GB-BLACK (2 UNITS)" -> { base: "S26-ULTRA-512GB-BLACK", qty: 2 }.
// Recognizes "(N UNIT[S])", "N pc[s]", "xN", etc. Defaults qty to 1.
const parseSku = (raw) => {
  const s = String(raw || '').trim()
  if (!s) return { base: '', qty: 0 }
  let qty = 1
  let base = s
  let m = s.match(/\(?\s*(\d+)\s*(?:units?|pcs?|pieces?|qty|ea)\s*\)?\s*$/i)
  if (m) { qty = parseInt(m[1], 10) || 1; base = s.slice(0, m.index) }
  else {
    m = s.match(/[x×]\s*(\d+)\s*$/i)
    if (m) { qty = parseInt(m[1], 10) || 1; base = s.slice(0, m.index) }
  }
  base = base.replace(/[\s\-–—(:]+$/, '').trim()
  return { base: base || s, qty }
}

// Levenshtein edit distance — used to spot near-duplicate SKUs (likely typos).
const editDistance = (a, b) => {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}

// SKU-redaction band for the standard UPS Letter (612×792) 3rd-party label,
// measured from a real label: the "Reference No.1: SKU#…" line (text spans pt
// ~4–273, so covering the left half of the page hides it). Given as a top-origin
// y-range, converted to pdf-lib's bottom-origin at draw time. The big bottom
// "<SKU> N pc" text is left alone — that's the user's own custom-written note.
const SKU_BANDS = [
  { top: 456, bottom: 473 },   // Reference No.1 SKU line (snug to the text)
]
// Fraction of the page width the black box spans (from the left edge).
const REDACT_WIDTH_FRAC = 0.5

// Copy text with a textarea fallback for non-secure contexts (packaged file://).
const copyText = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// Copy rich HTML (so pasting into Gmail renders a real table) with a plain-text
// alternative. Falls back to a contenteditable + execCommand for non-secure
// contexts (the packaged app over file://).
const copyRich = async (html, plain) => {
  try {
    if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })])
      return true
    }
  } catch { /* fall through */ }
  try {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    div.innerHTML = html
    div.style.position = 'fixed'
    div.style.left = '-9999px'
    div.style.opacity = '0'
    document.body.appendChild(div)
    const range = document.createRange()
    range.selectNodeContents(div)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    const ok = document.execCommand('copy')
    sel.removeAllRanges()
    document.body.removeChild(div)
    return ok
  } catch { return false }
}

// Dropship tab — upload the individual Walmart shipping-label PDFs, tag each
// with the tracking's last 4 digits + the SKU, then (a) merge them all into one
// PDF to attach, and (b) copy the "<last4> - <SKU>" list for the email body.
export default function DropshipTab({ addToast }) {
  const [items, setItems] = useState([])   // { id, name, bytes, pages, last4, sku }
  const [busy, setBusy] = useState(false)
  const [hideSku, setHideSku] = useState(() => {
    const s = loadSettings()
    return s.hideSku !== undefined ? !!s.hideSku : true
  })
  const fileRef = useRef(null)

  const toggleHideSku = () => setHideSku(prev => {
    const next = !prev
    try { localStorage.setItem('dropship_settings', JSON.stringify({ ...loadSettings(), hideSku: next })) } catch { /* ignore */ }
    return next
  })

  const handleFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name))
    if (!files.length) {
      addToast('Please choose PDF label file(s)', 'warning')
      return
    }
    try {
      const seen = new Set(items.map(it => it.sig))   // signatures already loaded
      const loaded = []
      const dups = []
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const sig = fileSig(bytes)
        if (seen.has(sig)) { dups.push(f.name); continue }   // duplicate — skip
        seen.add(sig)
        let pages = 0
        try { pages = (await PDFDocument.load(bytes)).getPageCount() } catch { /* keep 0 */ }
        loaded.push({ id: did++, name: f.name, bytes, pages, last4: '', sku: '', qty: '1', sig })
      }
      if (loaded.length) setItems(prev => [...prev, ...loaded])
      if (dups.length) {
        addToast(`Skipped ${dups.length} duplicate label${dups.length > 1 ? 's' : ''} — not added: ${dups.join(', ')}`, 'warning')
      }
      if (loaded.length) {
        addToast(`Added ${loaded.length} label PDF(s)`, 'success')
      } else if (!dups.length) {
        addToast('No labels added', 'warning')
      }
    } catch (err) {
      addToast(`Could not read PDF: ${err.message}`, 'warning')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [items, addToast])

  const setField = (id, field, value) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => setItems(prev => prev.filter(it => it.id !== id))

  const move = (id, dir) => setItems(prev => {
    const idx = prev.findIndex(it => it.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= prev.length) return prev
    const next = [...prev]
    const [x] = next.splice(idx, 1)
    next.splice(j, 0, x)
    return next
  })

  const clearAll = () => {
    setItems([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const combine = useCallback(async () => {
    if (!items.length) {
      addToast('Upload at least one label PDF', 'warning')
      return
    }
    setBusy(true)
    try {
      const merged = await PDFDocument.create()
      for (const it of items) {
        const src = await PDFDocument.load(it.bytes)
        const pages = await merged.copyPages(src, src.getPageIndices())
        pages.forEach(p => {
          if (hideSku) {
            const { width, height } = p.getSize()
            // Only redact standard Letter-height labels (skip odd sizes rather
            // than risk covering the wrong spot).
            if (height > 750 && height < 820) {
              SKU_BANDS.forEach(b => {
                p.drawRectangle({ x: 0, y: height - b.bottom, width: width * REDACT_WIDTH_FRAC, height: b.bottom - b.top, color: rgb(0, 0, 0) })
              })
            }
          }
          merged.addPage(p)
        })
      }
      const out = await merged.save()
      const blob = new Blob([out], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `Dropship_Labels_${stamp}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
      addToast(`Combined ${items.length} label(s) into one PDF`, 'success')
    } catch (err) {
      addToast(`Could not combine: ${err.message}`, 'warning')
    } finally {
      setBusy(false)
    }
  }, [items, addToast])

  // Repeated SKUs added up — how many of each product will be invoiced,
  // using each label's own Qty field.
  const skuTotals = useMemo(() => {
    const map = new Map()   // key: base.toUpperCase()  ->  { display, qty, count }
    items.forEach(it => {
      const base = parseSku(it.sku).base
      if (!base) return
      const q = parseInt(String(it.qty), 10)
      const qty = Number.isFinite(q) && q > 0 ? q : 1
      const key = base.toUpperCase()
      const cur = map.get(key)
      if (cur) { cur.qty += qty; cur.count += 1 }
      else map.set(key, { display: base, qty, count: 1 })
    })
    return Array.from(map.values()).sort((a, b) => a.display.localeCompare(b.display))
  }, [items])

  // Near-duplicate SKUs (edit distance 1–2) — likely copy mistakes. Real variants
  // like 256GB vs 512GB or BLACK vs VIOLET differ by ≥3 chars, so they're not flagged.
  const skuWarnings = useMemo(() => {
    const out = []
    for (let i = 0; i < skuTotals.length; i++) {
      for (let j = i + 1; j < skuTotals.length; j++) {
        const a = skuTotals[i], b = skuTotals[j]
        if (a.display.length < 5 || b.display.length < 5) continue
        const dist = editDistance(a.display.toUpperCase(), b.display.toUpperCase())
        if (dist >= 1 && dist <= 2) {
          // Assume the more frequently-used SKU is the intended one.
          const [typo, good] = a.count <= b.count ? [a, b] : [b, a]
          out.push({ typo: typo.display, suggestion: good.display })
        }
      }
    }
    return out
  }, [skuTotals])

  const copyList = useCallback(async () => {
    if (!items.length) {
      addToast('Upload at least one label first', 'warning')
      return
    }
    // Plain-text version (fallback / plain editors): label · SKU · qty.
    const lines = items.map(it => {
      const last4 = (it.last4 || '').trim()
      const sku = (it.sku || '').trim()
      const qty = (String(it.qty || '').trim()) || '1'
      const head = last4 ? `${last4} - ${sku}` : sku
      return `${head} - ${qty}`
    })
    let text = lines.join('\n')
    if (skuTotals.length) {
      text += '\n\nTotals (to invoice):\n' + skuTotals.map(t => `${t.display} — ${t.qty}`).join('\n')
    }

    // Rich HTML version — item lines stay as plain text; only the per-SKU
    // totals become a table.
    let html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;">${lines.map(escHtml).join('<br>')}</div>`
    if (skuTotals.length) {
      const tStyle = 'border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;'
      const th = 'style="background:#f0f0f0;text-align:left;"'
      const totRows = skuTotals.map(t =>
        `<tr><td>${escHtml(t.display)}</td><td align="center">${t.qty}</td></tr>`
      ).join('')
      html += `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:10px 0 4px;"><strong>Totals (to invoice):</strong></p>`
      html += `<table border="1" cellpadding="6" cellspacing="0" style="${tStyle}"><thead><tr><th ${th}>SKU</th><th ${th}>Qty</th></tr></thead><tbody>${totRows}</tbody></table>`
    }

    const ok = await copyRich(html, text)
    if (!ok) { addToast('Could not copy to clipboard', 'warning'); return }
    if (skuWarnings.length) {
      addToast(`Copied ${lines.length} item(s) + totals — but ${skuWarnings.length} SKU(s) look like possible typos, check below`, 'warning')
    } else {
      addToast(`Copied ${lines.length} item(s) + totals — paste into your email`, 'success')
    }
  }, [items, skuTotals, skuWarnings, addToast])

  const incomplete = items.filter(it => !it.last4.trim() || !it.sku.trim()).length

  return (
    <>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">Dropship Labels</h2>
          <p className="text-sm text-gray-400 mt-1">
            Combine Walmart shipping labels into one PDF and list the item on each
          </p>
        </div>
      </div>

      {/* Step 1 — upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            1 · Upload shipping label PDF(s)
          </label>
          {items.length > 0 && (
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600">
              Clear all
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFiles}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
        />
        <p className="text-xs text-gray-400 mt-2">
          Select one or more label PDFs — add again anytime to keep adding. Order below = order in the combined PDF.
        </p>
      </div>

      {/* Step 2 — per-label tracking last-4 + SKU */}
      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm py-10 text-center text-gray-400 text-sm mb-4">
          No labels yet — upload label PDFs above to start
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4">
          <div className="px-4 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              2 · Label · Last 4 · SKU · Qty
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider">
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Label file</th>
                  <th className="px-3 py-2 text-left w-28">Last 4</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left w-20">Qty</th>
                  <th className="px-3 py-2 text-center w-24">Order</th>
                  <th className="px-3 py-2 text-center w-12">Del</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-3 py-1.5 text-gray-700">
                      <span className="truncate block max-w-[220px]" title={it.name}>{it.name}</span>
                      {it.pages > 1 && <span className="text-xs text-gray-400">{it.pages} pages</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={it.last4}
                        onChange={e => setField(it.id, 'last4', e.target.value.trim())}
                        placeholder="e.g. 2139"
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={it.sku}
                        onChange={e => setField(it.id, 'sku', e.target.value)}
                        placeholder="e.g. S26-ULTRA-512GB-BLACK"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={it.qty}
                        onChange={e => setField(it.id, 'qty', e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="1"
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <button
                        onClick={() => move(it.id, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1 text-base leading-none"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(it.id, 1)}
                        disabled={idx === items.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1 text-base leading-none"
                        title="Move down"
                      >
                        ↓
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => remove(it.id)}
                        className="text-gray-400 hover:text-red-500 transition font-bold text-lg leading-none"
                        title="Remove this label"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <div className="text-sm text-gray-600 font-medium">
              {items.length} label{items.length !== 1 ? 's' : ''}
            </div>
            {incomplete > 0 && (
              <div className="text-xs text-amber-600">{incomplete} still missing last-4 or SKU</div>
            )}
          </div>
        </div>
      )}

      {/* Possible SKU typos — "did you mean" */}
      {skuWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="text-sm font-semibold text-amber-800 mb-2">
            Possible SKU typo{skuWarnings.length > 1 ? 's' : ''} — check before sending:
          </div>
          <ul className="text-sm text-amber-800 space-y-1">
            {skuWarnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.typo}</span> — did you mean{' '}
                <span className="font-mono font-semibold">{w.suggestion}</span>?
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invoice totals — repeated SKUs added up */}
      {skuTotals.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Totals to invoice ({skuTotals.length} SKU{skuTotals.length !== 1 ? 's' : ''})
          </label>
          <div className="overflow-auto max-h-64 border border-gray-100 rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left px-3 py-2 font-semibold">SKU</th>
                  <th className="text-right px-3 py-2 font-semibold w-24">Qty</th>
                </tr>
              </thead>
              <tbody>
                {skuTotals.map((t, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{t.display}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{t.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">These totals are appended to the copied item list.</p>
        </div>
      )}

      {/* Redaction option */}
      <label className="flex items-center gap-2 mb-2 text-sm text-gray-700 cursor-pointer select-none">
        <input type="checkbox" checked={hideSku} onChange={toggleHideSku} className="w-4 h-4 accent-blue-600" />
        Cover the SKU with a black box on each label
        <span className="text-gray-400">(hides it from carriers — tuned for UPS Letter labels)</span>
      </label>

      {/* Footer actions */}
      <div className="mt-4 flex justify-end items-center gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={copyList}
          disabled={items.length === 0}
          title={items.length === 0 ? 'Upload labels first' : 'Copy the last-4 + SKU list for the email'}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Copy item list
        </button>
        <button
          onClick={combine}
          disabled={items.length === 0 || busy}
          title={items.length === 0 ? 'Upload labels first' : 'Merge all labels into one PDF'}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
        >
          {busy ? 'Combining…' : `Combine into one PDF (${items.length})`}
        </button>
      </div>
    </>
  )
}
