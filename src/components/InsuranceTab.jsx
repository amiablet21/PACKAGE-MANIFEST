import React, { useState, useMemo, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

// SmartUpload template header row (exact order/spelling from the template file).
const TEMPLATE_HEADERS = [
  'TRACKINGNUMBER', 'TRANSPORTATIONCARRIER', 'SHIPDATE', 'SERVICELEVEL',
  'INSUREDVALUE', 'CONSIGNEE', 'SHIPTOADDRESSLINE1', 'SHIPTOCITY',
  'SHIPTOSTATE', 'SHIPTOZIP', 'SHIPTOCOUNTRY', 'SHIPFROMADDRESSLINE1',
  'SHIPFROMCITY', 'SHIPFROMSTATE', 'SHIPFROMZIP', 'SHIPFROMCOUNTRY',
  'REF1', 'REF2',
]

// PO-file header → handling. Lookups are case/space-insensitive so minor
// export variations (extra spaces, capitalization) still resolve.
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// Valid USPS state/territory codes — the ship-from State must be one of these,
// never a spelled-out name like "New Jersey".
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
])

// Our single warehouse — pre-filled on every load so the ship-from is ready
// to go. A saved value (if the user edits a field) still overrides these.
const DEFAULT_WAREHOUSE = {
  address: '1275 Bloomfield Ave, BULDG 7, UNIT 42',
  city: 'Fairfield',
  state: 'NJ',
  zip: '07004',
  country: 'USA',
}

// InsureShield Service Level codes — the upload expects these 3-letter codes,
// not the on-screen label.
const SERVICE_LEVELS = [
  { code: 'SMP', label: 'Small Package' },
  { code: 'AIR', label: 'Air' },
  { code: 'FTL', label: 'Truck/Train' },
]

const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem('insurance_settings') || '{}') }
  catch { return {} }
}

export default function InsuranceTab({ addToast }) {
  const saved = loadSettings()
  const [threshold, setThreshold] = useState(
    Number.isFinite(saved.threshold) ? saved.threshold : 500
  )
  const [serviceLevel, setServiceLevel] = useState(
    SERVICE_LEVELS.some(s => s.code === saved.serviceLevel) ? saved.serviceLevel : 'SMP'
  )
  const [wh, setWh] = useState({
    address: saved.whAddress || DEFAULT_WAREHOUSE.address,
    city: saved.whCity || DEFAULT_WAREHOUSE.city,
    state: saved.whState || DEFAULT_WAREHOUSE.state,
    zip: saved.whZip || DEFAULT_WAREHOUSE.zip,
    country: saved.whCountry || DEFAULT_WAREHOUSE.country,
  })
  const [fileName, setFileName] = useState('')
  const [poRows, setPoRows] = useState([])      // array of {header: value}
  const fileRef = useRef(null)

  const persist = useCallback((next) => {
    const s = loadSettings()
    localStorage.setItem('insurance_settings', JSON.stringify({ ...s, ...next }))
  }, [])

  const updateThreshold = useCallback((v) => {
    const n = v === '' ? '' : Number(v)
    setThreshold(v === '' ? '' : (Number.isFinite(n) ? n : 0))
    if (Number.isFinite(n)) persist({ threshold: n })
  }, [persist])

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

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        // PO export's data sheet is the first one ("Po Details").
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
        if (!rows.length) {
          addToast('That file has no data rows', 'warning')
          return
        }
        setPoRows(rows)
        setFileName(file.name)
        addToast(`Loaded ${rows.length} row(s) from ${file.name}`, 'success')
      } catch (err) {
        addToast(`Could not read file: ${err.message}`, 'warning')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [addToast])

  // Resolve a PO column value by trying candidate header names.
  const pick = useCallback((row, keyMap, candidates) => {
    for (const c of candidates) {
      const real = keyMap[norm(c)]
      if (real !== undefined) return row[real]
    }
    return ''
  }, [])

  // Build {normalizedHeader -> actualHeader} once per row set.
  const keyMap = useMemo(() => {
    const m = {}
    if (poRows[0]) Object.keys(poRows[0]).forEach(k => { m[norm(k)] = k })
    return m
  }, [poRows])

  const parseCost = (v) => {
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(n) ? n : NaN
  }

  // InsureShield SmartUpload requires US-format dates (MM/DD/YYYY). PO exports
  // ship dates as ISO "YYYY-MM-DD" strings, but handle Excel date serials and
  // Date objects too in case a future export stores them differently.
  const fmtDate = (v) => {
    if (v === '' || v == null) return ''
    const mmddyyyy = (y, m, d) =>
      `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`
    if (typeof v === 'number') {
      const dc = XLSX.SSF?.parse_date_code(v)
      return dc ? mmddyyyy(dc.y, dc.m, dc.d) : ''
    }
    if (v instanceof Date && !isNaN(v)) {
      return mmddyyyy(v.getFullYear(), v.getMonth() + 1, v.getDate())
    }
    const s = String(v).trim()
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (iso) return mmddyyyy(iso[1], iso[2], iso[3])
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s   // already MM/DD/YYYY
    const d = new Date(s)
    return isNaN(d) ? s : mmddyyyy(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }

  // Rows that pass the price filter (Item Cost > threshold).
  const filtered = useMemo(() => {
    const t = threshold === '' ? 0 : Number(threshold)
    return poRows.filter(r => {
      const cost = parseCost(pick(r, keyMap, ['Item Cost']))
      return Number.isFinite(cost) && cost > t
    })
  }, [poRows, threshold, keyMap, pick])

  const buildRow = useCallback((r) => {
    const g = (cands) => pick(r, keyMap, cands)
    return [
      g(['Tracking Number']),                 // TRACKINGNUMBER
      g(['Carrier']),                         // TRANSPORTATIONCARRIER
      fmtDate(g(['Ship By'])),                // SHIPDATE (MM/DD/YYYY)
      serviceLevel,                           // SERVICELEVEL (InsureShield mode)
      parseCost(g(['Item Cost'])),            // INSUREDVALUE
      g(['Customer Name']),                   // CONSIGNEE
      g(['Ship to Address 1']),               // SHIPTOADDRESSLINE1
      g(['City']),                            // SHIPTOCITY
      g(['State']),                           // SHIPTOSTATE
      g(['Zip']),                             // SHIPTOZIP
      g(['Ship to Country']),                 // SHIPTOCOUNTRY
      wh.address,                             // SHIPFROMADDRESSLINE1
      wh.city,                                // SHIPFROMCITY
      wh.state,                               // SHIPFROMSTATE
      wh.zip,                                 // SHIPFROMZIP
      wh.country,                             // SHIPFROMCOUNTRY
      g(['PO#']),                             // REF1
      g(['Order#']),                          // REF2
    ]
  }, [pick, keyMap, wh, serviceLevel])

  const handleDownload = useCallback(() => {
    if (!filtered.length) {
      addToast('Nothing to export — no items above the price threshold', 'warning')
      return
    }
    const aoa = [TEMPLATE_HEADERS, ...filtered.map(buildRow)]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `SmartUpload_${stamp}.xlsx`)
    addToast(`Exported ${filtered.length} item(s) to SmartUpload`, 'success')
  }, [filtered, buildRow, addToast])

  const clearFile = useCallback(() => {
    setPoRows([])
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const totalCount = poRows.length
  const passCount = filtered.length
  const t = threshold === '' ? 0 : Number(threshold)

  return (
    <>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">Insurance Upload</h2>
          <p className="text-sm text-gray-400 mt-1">
            Map a PO export to the InsureShield SmartUpload template
          </p>
        </div>
      </div>

      {/* Step 1 — upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            1 · Upload PO file (.xlsx)
          </label>
          {fileName && (
            <button onClick={clearFile} className="text-xs text-gray-400 hover:text-gray-600">
              Clear
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
        />
        {fileName && (
          <p className="text-sm text-gray-500 mt-2">
            Loaded <span className="font-semibold text-gray-700">{fileName}</span> — {totalCount} row(s)
          </p>
        )}
      </div>

      {/* Step 2 — price threshold */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          2 · Insure only items priced over (Item Cost / column AB)
        </label>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-lg font-semibold">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={threshold}
            onChange={e => updateThreshold(e.target.value)}
            className="w-40 border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {totalCount > 0 && (
            <span className="text-sm text-gray-500">
              <span className="font-bold text-blue-600">{passCount}</span> of {totalCount} item(s) are over ${t}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Saved automatically — used as the default next time.</p>
      </div>

      {/* Step 3 — service level (InsureShield transport mode) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          3 · Service level (InsureShield transport mode)
        </label>
        <select
          value={serviceLevel}
          onChange={e => { setServiceLevel(e.target.value); persist({ serviceLevel: e.target.value }) }}
          className="w-64 border border-gray-300 rounded-md px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {SERVICE_LEVELS.map(s => (
            <option key={s.code} value={s.code}>{s.label} (code {s.code})</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-2">
          Use <span className="font-semibold">Small Package</span> for UPS/FedEx parcels (incl. Ground &amp; 2-Day Air). Air / Truck/Train are for freight.
        </p>
      </div>

      {/* Step 4 — ship-from warehouse */}
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
      </div>

      {/* Step 4 — download */}
      <div className="mt-6 flex justify-end items-center gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={handleDownload}
          disabled={passCount === 0}
          title={passCount === 0 ? 'Upload a file and set a threshold first' : 'Download the completed SmartUpload file'}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
        >
          Download SmartUpload ({passCount})
        </button>
      </div>
    </>
  )
}
