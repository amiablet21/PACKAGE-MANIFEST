import React, { useState, useMemo, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

// UPS Batch File Shipping template header row — the exact 80-column order read
// from ups-batch-file-shipping-GLOBAL.xlsx, sheet "Batch File Sample". Rows are
// mapped into this order by header NAME (see COL below), never by a bare index.
const UPS_HEADERS = [
  'Contact Name', 'Company or Name', 'Country', 'Address 1', 'Address 2',
  'Address 3', 'City/Commune/Ward', 'State/Prov/Other', 'Postal Code', 'Telephone',
  'Ext', 'Residential Ind', 'Consignee Email', 'Packaging Type', 'Customs Value',
  'Weight', 'Length', 'Width', 'Height', 'Unit of Measure',
  'Description of Goods', 'Documents of No Commercial Value', 'GNIFC', 'Pkg Decl Value', 'Service',
  'Delivery Confirm', 'Shipper Release', 'Ret of Documents', 'Saturday Deliver', 'Carbon Neutral',
  'Large Package', 'Addl handling', 'Reference 1', 'Reference 2', 'Reference 3',
  'QV Notif 1-Addr', 'QV Notif 1-Ship', 'QV Notif 1-Excp', 'QV Notif 1-Delv',
  'QV Notif 2-Addr', 'QV Notif 2-Ship', 'QV Notif 2-Excp', 'QV Notif 2-Delv',
  'QV Notif 3-Addr', 'QV Notif 3-Ship', 'QV Notif 3-Excp', 'QV Notif 3-Delv',
  'QV Notif 4-Addr', 'QV Notif 4-Ship', 'QV Notif 4-Excp', 'QV Notif 4-Delv',
  'QV Notif 5-Addr', 'QV Notif 5-Ship', 'QV Notif 5-Excp', 'QV Notif 5-Delv',
  'QV Notif Msg', 'QV Failure Addr', 'UPS Premium Care', 'ADL Location ID', 'ADL Media Type',
  'ADL Language', 'ADL Notification Addr', 'ADL Failure Addr', 'ADL COD Value',
  'ADL Deliver to Addressee', 'ADL Shipper Media Type', 'ADL Shipper Language',
  'ADL Shipper Notification Addr', 'ADL Direct Delivery Only',
  'Electronic Package Release Authentication', 'Lithium Ion Alone',
  'Lithium Ion In Equipment', 'Lithium Ion With_Equipment', 'Lithium Metal Alone',
  'Lithium Metal In Equipment', 'Lithium Metal With Equipment',
  'Weekend Commercial Delivery', 'Dry Ice Weight', 'Merchandise Description',
  'UPS Ground Saver Limited Quantity/Lithium Battery',
]

// Header name -> column index, so we place each field by name into the fixed order.
const COL = UPS_HEADERS.reduce((m, h, i) => { m[h] = i; return m }, {})

const MAX_ROWS = 250

// UPS Batch File upload page. The tx token is tied to your UPS upload session;
// if UPS issues a new one, update it here.
const UPS_UPLOAD_URL = 'https://www.ups.com/ship/batchUpload?tx=21722993116593625'

// PO-file header → handling. Lookups are case/space-insensitive so minor export
// variations (extra spaces, capitalization) still resolve.
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// Valid USPS state/territory codes — the ship-from State must be one of these.
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
])

// Our single warehouse — the UPS shipper origin (the "DIGITAL WORLD SHOP" block
// printed on labels). Pre-filled on every load; a saved edit overrides it. NOTE:
// the UPS batch file has no ship-from columns, so this is documentation/parity
// only and is never written to the CSV.
const DEFAULT_WAREHOUSE = {
  address: '1275 Bloomfield Ave, BULDG 7, UNIT 42',
  city: 'Fairfield',
  state: 'NJ',
  zip: '07004',
  country: 'USA',
}

// Service-level modes for step 3.
const SERVICE_MODES = [
  { value: 'force02', label: 'Force all → 2nd Day Air (02)' },
  { value: 'force03', label: 'Force all → Ground (03)' },
  { value: 'walmart', label: 'Use Walmart tier per order' },
]

// Default SKU-shortening map, applied to Reference 2 to fit UPS's 35-char limit.
// Configurable: merged with any { skuMap } saved in settings.
const DEFAULT_SKU_SHORTEN = {
  'S25-ULTRA-512GB-SILVERBLUE-US': 'S25-ULTRA-512GB-SLVRBLU-US',
}

// Region identifiers that carry no shipping meaning — dropped from the SKU when
// building Reference 2 so the part number stays under UPS's 35-char limit. Only
// removed when they appear as a whole hyphen-delimited segment (so "US" inside a
// word is never touched).
const SKU_DROP_SEGMENTS = new Set(['INTRL', 'INTL', 'INT', 'US'])
const stripSkuIdentifiers = (sku) =>
  String(sku).split('-').filter(p => p && !SKU_DROP_SEGMENTS.has(p.toUpperCase())).join('-')

const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem('ups_batch_settings') || '{}') }
  catch { return {} }
}

// Comma is the UPS delimiter — strip it (and any stray newlines) from every
// field, collapsing whitespace so values stay readable.
const clean = (v) => String(v ?? '').replace(/[\r\n,]+/g, ' ').replace(/\s+/g, ' ').trim()

export default function UpsBatchTab({ addToast }) {
  const saved = loadSettings()
  const [weight, setWeight] = useState(saved.weight ?? '2')
  const [dims, setDims] = useState({
    length: saved.length ?? '8',
    width: saved.width ?? '5',
    height: saved.height ?? '2',
  })
  const [serviceMode, setServiceMode] = useState(
    SERVICE_MODES.some(m => m.value === saved.serviceMode) ? saved.serviceMode : 'force02'
  )
  const [wh, setWh] = useState({
    address: saved.whAddress || DEFAULT_WAREHOUSE.address,
    city: saved.whCity || DEFAULT_WAREHOUSE.city,
    state: saved.whState || DEFAULT_WAREHOUSE.state,
    zip: saved.whZip || DEFAULT_WAREHOUSE.zip,
    country: saved.whCountry || DEFAULT_WAREHOUSE.country,
  })
  // Attached PO files ({ name, count }). Multiple files accumulate into poRows
  // so a shipment can be assembled from several partial exports.
  const [files, setFiles] = useState([])
  const [poRows, setPoRows] = useState([])
  // Per-order dimension overrides, keyed by row index. A field absent here
  // falls back to the step-2 default.
  const [rowDims, setRowDims] = useState({})
  // Original PO-row indices the user has removed from the export.
  const [removed, setRemoved] = useState(() => new Set())
  const fileRef = useRef(null)

  const skuMap = useMemo(() => ({ ...DEFAULT_SKU_SHORTEN, ...(saved.skuMap || {}) }), [saved.skuMap])

  const persist = useCallback((next) => {
    const s = loadSettings()
    localStorage.setItem('ups_batch_settings', JSON.stringify({ ...s, ...next }))
  }, [])

  const updateWeight = useCallback((v) => {
    setWeight(v)
    if (v !== '') persist({ weight: v })
  }, [persist])

  const updateDim = useCallback((field, v) => {
    setDims(prev => {
      const next = { ...prev, [field]: v }
      if (v !== '') persist({ [field]: v })
      return next
    })
  }, [persist])

  // Override one dimension field for a single order row (empty falls back to the
  // step-2 default at build time).
  const setRowDim = useCallback((i, field, value) => {
    setRowDims(prev => ({ ...prev, [i]: { ...(prev[i] || {}), [field]: value } }))
  }, [])

  const removeRow = useCallback((i) => {
    setRemoved(prev => { const n = new Set(prev); n.add(i); return n })
  }, [])

  const restoreAll = useCallback(() => setRemoved(new Set()), [])

  const updateWh = useCallback((field, value) => {
    setWh(prev => {
      const next = { ...prev, [field]: value }
      persist({
        whAddress: next.address, whCity: next.city, whState: next.state,
        whZip: next.zip, whCountry: next.country,
      })
      return next
    })
  }, [persist])

  // Read one .xlsx into its "Po Details" rows.
  const readFileRows = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets['Po Details'] || wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('could not read file'))
    reader.readAsArrayBuffer(file)
  })

  // Attach one or more files; their rows are appended to what's already loaded
  // (attach again later to keep adding). Existing per-row edits/removals are
  // preserved because appended rows only take new indices.
  const handleFile = useCallback(async (e) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    try {
      const results = await Promise.all(
        selected.map(async f => ({ name: f.name, rows: await readFileRows(f) }))
      )
      const newRows = results.flatMap(r => r.rows)
      if (!newRows.length) {
        addToast('No data rows found in those file(s)', 'warning')
        return
      }
      setPoRows(prev => [...prev, ...newRows])
      setFiles(prev => [...prev, ...results.map(r => ({ name: r.name, count: r.rows.length }))])
      addToast(`Added ${newRows.length} row(s) from ${selected.length} file(s)`, 'success')
    } catch (err) {
      addToast(`Could not read file: ${err.message}`, 'warning')
    } finally {
      if (fileRef.current) fileRef.current.value = ''   // allow re-selecting the same file
    }
  }, [addToast])

  const keyMap = useMemo(() => {
    const m = {}
    if (poRows[0]) Object.keys(poRows[0]).forEach(k => { m[norm(k)] = k })
    return m
  }, [poRows])

  const pick = useCallback((row, candidates) => {
    for (const c of candidates) {
      const real = keyMap[norm(c)]
      if (real !== undefined) return row[real]
    }
    return ''
  }, [keyMap])

  // 5-digit ZIP, preserving/restoring leading zeros. Returns '' for no digits.
  const zip5 = (raw) => {
    const d = String(raw).replace(/\D/g, '')
    if (!d) return ''
    return d.length >= 5 ? d.slice(0, 5) : d.padStart(5, '0')
  }

  const shortenSku = useCallback((sku) => {
    if (!sku) return sku
    return skuMap[sku] || skuMap[sku.toUpperCase()] || sku
  }, [skuMap])

  // Reference 2 = "<SKU> (<Qty> UNIT[S])", shortened to fit UPS's 35-char cap.
  const buildRef2 = useCallback((skuRaw, qtyRaw) => {
    const sku = stripSkuIdentifiers(shortenSku(clean(skuRaw)))
    const qty = clean(qtyRaw) || '1'
    const unit = Number(qty) > 1 ? 'UNITS' : 'UNIT'
    let ref2 = `${sku} (${qty} ${unit})`
    if (ref2.length > 35) ref2 = `${sku} (${qty})`
    if (ref2.length > 35) ref2 = ref2.slice(0, 35)
    return ref2
  }, [shortenSku])

  // Walmart Shipping Tier → UPS service code (string keeps leading zeros).
  const serviceFor = useCallback((tierRaw) => {
    if (serviceMode === 'force02') return '02'
    if (serviceMode === 'force03') return '03'
    const t = String(tierRaw).toUpperCase()
    if (t.includes('NEXT')) return '01'
    if (t.includes('TWO') || /(^|\D)2(\D|$)/.test(t)) return '02'
    if (t.includes('STANDARD')) return '03'
    return '02'
  }, [serviceMode])

  // The orders we'll export as { r, i } where i is the original PO-row index
  // (kept stable so removals/edits don't shift each other). Removed rows are
  // skipped; the MAX_ROWS cap applies to what's kept. No price filter —
  // declared value lives only in the Insurance tab.
  const exportRows = useMemo(() => {
    const out = []
    for (let i = 0; i < poRows.length && out.length < MAX_ROWS; i++) {
      if (removed.has(i)) continue
      out.push({ r: poRows[i], i })
    }
    return out
  }, [poRows, removed])

  const buildRow = useCallback((r, i) => {
    const row = new Array(UPS_HEADERS.length).fill('')
    const set = (name, val) => { row[COL[name]] = val }
    const od = rowDims[i] || {}

    const name = clean(pick(r, ['Customer Name']))
    set('Contact Name', name)
    set('Company or Name', name)
    set('Country', 'US')
    set('Address 1', clean(pick(r, ['Ship to Address 1'])))
    set('Address 2', clean(pick(r, ['Ship to Address 2'])))
    set('City/Commune/Ward', clean(pick(r, ['City'])))
    set('State/Prov/Other', clean(pick(r, ['State'])).toUpperCase().slice(0, 2))
    set('Postal Code', zip5(pick(r, ['Zip'])))
    set('Telephone', clean(pick(r, ['Customer Phone Number'])))
    set('Residential Ind', '1')
    set('Packaging Type', '2')
    set('Weight', clean(od.weight ?? weight) || '2')
    set('Length', clean(od.length ?? dims.length) || '8')
    set('Width', clean(od.width ?? dims.width) || '5')
    set('Height', clean(od.height ?? dims.height) || '2')
    set('Unit of Measure', 'LB')
    set('Pkg Decl Value', '')                       // ALWAYS blank — insure via Insurance tab
    set('Service', serviceFor(pick(r, ['Shipping Tier'])))
    set('Reference 1', clean(pick(r, ['PO#'])))
    set('Reference 2', buildRef2(pick(r, ['SKU']), pick(r, ['Qty'])))
    return row
  }, [pick, weight, dims, rowDims, serviceFor, buildRef2])

  // Per-row validation — surfaced as warnings; nothing silent.
  const issues = useMemo(() => {
    const out = []
    exportRows.forEach(({ r, i }) => {
      const po = clean(pick(r, ['PO#'])) || `(row ${i + 1})`
      const addr1 = clean(pick(r, ['Ship to Address 1']))
      const z = zip5(pick(r, ['Zip']))
      const st = clean(pick(r, ['State'])).toUpperCase().slice(0, 2)
      const probs = []
      if (!addr1) probs.push('missing Address 1')
      if (!z || z === '00000') probs.push('blank/suspicious ZIP')
      if (!/^[A-Z]{2}$/.test(st) || !US_STATES.has(st)) probs.push('bad State')
      if (probs.length) out.push({ po, probs })
    })
    return out
  }, [exportRows, pick])

  const toCsv = (aoa) => aoa.map(row => row.join(',')).join('\r\n')

  const downloadText = (filename, text) => {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // The UPS upload file — NO header row (UPS requirement).
  const handleDownload = useCallback(() => {
    if (!exportRows.length) {
      addToast('Upload a PO file first', 'warning')
      return
    }
    const data = exportRows.map(({ r, i }) => buildRow(r, i))
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`UPS_Batch_${stamp}.csv`, toCsv(data))
    const extra = poRows.length > MAX_ROWS ? ` (capped at ${MAX_ROWS} of ${poRows.length})` : ''
    addToast(`Exported ${data.length} UPS label row(s)${extra}`, 'success')
  }, [exportRows, buildRow, poRows.length, addToast])

  // The review copy — WITH headers, for eyeballing before upload.
  const handleDownloadReview = useCallback(() => {
    if (!exportRows.length) {
      addToast('Upload a PO file first', 'warning')
      return
    }
    const data = exportRows.map(({ r, i }) => buildRow(r, i))
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`UPS_Batch_${stamp}_review.csv`, toCsv([UPS_HEADERS, ...data]))
    addToast(`Downloaded review copy — ${data.length} row(s), with headers`, 'success')
  }, [exportRows, buildRow, addToast])

  // Copy text to the clipboard, with a textarea fallback for non-secure
  // contexts (e.g. the packaged app loading over file://).
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

  // Item list for the vendor dropship email: one line per order,
  // "<last 4 of tracking #> - <SKU> (<qty> UNIT[S])".
  const copyItemList = useCallback(async () => {
    if (!exportRows.length) {
      addToast('Upload a PO file first', 'warning')
      return
    }
    const lines = exportRows.map(({ r }) => {
      // Prefix with the last 4 of the tracking # when the PO carries one;
      // otherwise (UPS assigns tracking at label time) just list the item.
      const last4 = clean(pick(r, ['Tracking Number'])).slice(-4)
      const ref2 = buildRef2(pick(r, ['SKU']), pick(r, ['Qty']))
      return last4 ? `${last4} - ${ref2}` : ref2
    })
    const ok = await copyText(lines.join('\n'))
    addToast(
      ok ? `Copied ${lines.length} item(s) — paste into your vendor email` : 'Could not copy to clipboard',
      ok ? 'success' : 'warning'
    )
  }, [exportRows, pick, buildRef2, addToast])

  // Open the UPS batch upload page in the system browser (Electron), falling
  // back to a normal new tab when running in a plain browser (dev mode).
  const openUpsUpload = useCallback(() => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(UPS_UPLOAD_URL)
        .then(res => { if (res && res.ok === false) addToast(`Could not open UPS: ${res.error}`, 'warning') })
        .catch(() => window.open(UPS_UPLOAD_URL, '_blank'))
    } else {
      window.open(UPS_UPLOAD_URL, '_blank', 'noopener')
    }
  }, [addToast])

  const clearFile = useCallback(() => {
    setPoRows([])
    setFiles([])
    setRowDims({})
    setRemoved(new Set())
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  // Products loaded, grouped by SKU with total quantity (kept rows only).
  const skuSummary = useMemo(() => {
    const m = new Map()
    exportRows.forEach(({ r }) => {
      const sku = clean(pick(r, ['SKU'])) || '(no SKU)'
      const qtyN = parseInt(clean(pick(r, ['Qty'])), 10)
      m.set(sku, (m.get(sku) || 0) + (Number.isFinite(qtyN) ? qtyN : 1))
    })
    return Array.from(m, ([sku, qty]) => ({ sku, qty })).sort((a, b) => a.sku.localeCompare(b.sku))
  }, [exportRows, pick])

  const count = exportRows.length

  return (
    <>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">UPS Batch Labels</h2>
          <p className="text-sm text-gray-400 mt-1">
            Map a Walmart PO export to the UPS Batch File Shipping template
          </p>
        </div>
      </div>

      {/* Step 1 — upload (one or more files, combined) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            1 · Upload PO file(s) (.xlsx)
          </label>
          {files.length > 0 && (
            <button onClick={clearFile} className="text-xs text-gray-400 hover:text-gray-600">
              Clear all
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={handleFile}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
        />
        <p className="text-xs text-gray-400 mt-2">
          Select one or more files — attach again anytime to add more (rows are combined).
        </p>
        {files.length > 0 && (
          <div className="mt-3 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="font-medium text-gray-700 truncate mr-3">{f.name}</span>
                <span className="text-gray-400 whitespace-nowrap">{f.count} row(s)</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-1 mt-1 border-t border-gray-100">
              <span className="text-gray-500">Total loaded ({files.length} file{files.length !== 1 ? 's' : ''})</span>
              <span className="font-bold text-gray-700">{poRows.length} row(s)</span>
            </div>
          </div>
        )}
      </div>

      {/* Products loaded — SKU × qty summary */}
      {count > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Products loaded ({skuSummary.length} SKU{skuSummary.length !== 1 ? 's' : ''})
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
                {skuSummary.map((s, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.sku}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{s.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 2 — package weight & dimensions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          2 · Package weight &amp; dimensions
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="block text-xs text-gray-500 mb-1">Weight (lbs)</span>
            <input
              type="number" min="0" step="0.1" value={weight}
              onChange={e => updateWeight(e.target.value)}
              className="w-28 border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <span className="block text-xs text-gray-500 mb-1">Length (in)</span>
              <input
                type="number" min="0" step="0.1" value={dims.length}
                onChange={e => updateDim('length', e.target.value)}
                className="w-20 border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <span className="pb-2 text-gray-400 font-semibold">×</span>
            <div>
              <span className="block text-xs text-gray-500 mb-1">Width (in)</span>
              <input
                type="number" min="0" step="0.1" value={dims.width}
                onChange={e => updateDim('width', e.target.value)}
                className="w-20 border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <span className="pb-2 text-gray-400 font-semibold">×</span>
            <div>
              <span className="block text-xs text-gray-500 mb-1">Height (in)</span>
              <input
                type="number" min="0" step="0.1" value={dims.height}
                onChange={e => updateDim('height', e.target.value)}
                className="w-20 border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Saved automatically — used as the default next time.</p>
      </div>

      {/* Per-order dimensions — editable table, shown once a file is loaded */}
      {count > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Per-order dimensions
            </label>
            {removed.size > 0 && (
              <button onClick={restoreAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                {removed.size} removed · Restore all
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Each row starts from the step-2 defaults — edit any row to override just that order, or × to drop it.
          </p>
          <div className="overflow-auto max-h-96 border border-gray-100 rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left px-3 py-2 font-semibold">PO#</th>
                  <th className="text-left px-3 py-2 font-semibold">SKU</th>
                  <th className="px-2 py-2 font-semibold">Wt (lb)</th>
                  <th className="px-2 py-2 font-semibold">L (in)</th>
                  <th className="px-2 py-2 font-semibold">W (in)</th>
                  <th className="px-2 py-2 font-semibold">H (in)</th>
                  <th className="px-2 py-2 font-semibold w-10"></th>
                </tr>
              </thead>
              <tbody>
                {exportRows.map(({ r, i }) => {
                  const od = rowDims[i] || {}
                  const cell = (field, fallback) => (
                    <td className="px-2 py-1 text-center">
                      <input
                        type="number" min="0" step="0.1"
                        value={od[field] ?? fallback}
                        onChange={e => setRowDim(i, field, e.target.value)}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  )
                  return (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1 font-mono text-xs text-gray-700 whitespace-nowrap">{clean(pick(r, ['PO#']))}</td>
                      <td className="px-3 py-1 text-gray-700 whitespace-nowrap">{buildRef2(pick(r, ['SKU']), pick(r, ['Qty']))}</td>
                      {cell('weight', weight)}
                      {cell('length', dims.length)}
                      {cell('width', dims.width)}
                      {cell('height', dims.height)}
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-gray-400 hover:text-red-500 transition font-bold text-lg leading-none"
                          title="Remove this order from the batch"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3 — service level */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          3 · Service level
        </label>
        <select
          value={serviceMode}
          onChange={e => { setServiceMode(e.target.value); persist({ serviceMode: e.target.value }) }}
          className="w-72 border border-gray-300 rounded-md px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {SERVICE_MODES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-2">
          Per-order mapping (when using the Walmart tier): TWO/2 → 02, STANDARD → 03, NEXT → 01, default 02.
        </p>
      </div>

      {/* Step 4 — ship-from warehouse (UPS shipper origin) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          4 · Ship-from (warehouse) address
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text" placeholder="Address line 1" value={wh.address}
            onChange={e => updateWh('address', e.target.value)}
            className="md:col-span-2 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text" placeholder="City" value={wh.city}
            onChange={e => updateWh('city', e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text" placeholder="State" value={wh.state}
              maxLength={2}
              onChange={e => updateWh('state', e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))}
              title="2-letter state code (e.g. NJ)"
              className={`border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                wh.state && !US_STATES.has(wh.state)
                  ? 'border-red-400 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            <input
              type="text" placeholder="Zip" value={wh.zip}
              onChange={e => updateWh('zip', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text" placeholder="Country" value={wh.country}
              onChange={e => updateWh('country', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          The UPS shipper origin — matches the “DIGITAL WORLD SHOP …” block printed on your labels.
        </p>
      </div>

      {/* Validation warnings */}
      {count > 0 && issues.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold text-red-700 mb-2">
            {issues.length} row(s) have address problems — fix in the PO file or proceed knowingly:
          </p>
          <ul className="text-xs text-red-600 space-y-0.5 max-h-40 overflow-y-auto">
            {issues.slice(0, 50).map((it, i) => (
              <li key={i}><span className="font-mono">{it.po}</span> — {it.probs.join(', ')}</li>
            ))}
            {issues.length > 50 && <li>…and {issues.length - 50} more</li>}
          </ul>
        </div>
      )}

      {poRows.length > MAX_ROWS && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          {poRows.length} rows uploaded — UPS batch files are capped at {MAX_ROWS}, so only the first {MAX_ROWS} will be exported.
        </div>
      )}

      {/* Download + upload-to-UPS link */}
      <div className="mt-6 flex justify-between items-center gap-3 border-t border-gray-200 pt-4">
        <div className="flex items-center gap-3">
          <button
            onClick={openUpsUpload}
            title="Open the UPS batch upload page in your browser"
            className="px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition text-sm font-semibold"
          >
            To upload to UPS, click here ↗
          </button>
          <button
            onClick={copyItemList}
            disabled={count === 0}
            title={count === 0 ? 'Upload a PO file first' : 'Copy the item list for the vendor dropship email'}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Copy item list
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadReview}
            disabled={count === 0}
            title={count === 0 ? 'Upload a PO file first' : 'Download the review copy (CSV with headers)'}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download review (headers)
          </button>
          <button
            onClick={handleDownload}
            disabled={count === 0}
            title={count === 0 ? 'Upload a PO file first' : 'Download the UPS upload CSV (no header row)'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
          >
            Download UPS Batch ({count})
          </button>
        </div>
      </div>
    </>
  )
}
