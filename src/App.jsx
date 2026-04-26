import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import Settings from './components/Settings'
import Toast from './components/Toast'
import ManifestTable from './components/ManifestTable'
import FileUploader from './components/FileUploader'
import ColumnMapper from './components/ColumnMapper'
import SignatureSection from './components/SignatureSection'
import NotesSection from './components/NotesSection'
import PrintView from './components/PrintView'
import { printManifest } from './utils/printManifest'

// Central Make.com webhook — baked into the app so users never see it.
// Every install routes through this single endpoint; Make.com reads
// to_email / cc_emails from the payload and routes each message accordingly.
const WEBHOOK_URL = 'https://hook.us2.make.com/6w71yms7ahggffj87m2rxy3w8n9gh3yr'

// Shared secret sent as X-Manifest-Token header. Make.com scenario has a
// filter that rejects requests without this exact value. This is not strong
// cryptographic auth (the secret ships inside the .exe and can be extracted),
// but it stops drive-by bots scanning for open webhooks and forces any
// attacker to actually reverse-engineer the binary first.
const APP_TOKEN = 'mnf_3o28dBCBH0VAhtxVhg--eIWB0iQOJUA2'

// Escape HTML to prevent injection in the tracking table sent as the email body.
// Without this, a tracking number like `<img src=x onerror=...>` would be
// rendered as live HTML by some email clients.
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const today = () => new Date().toISOString().slice(0, 10)
const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

let rowId = 1
const makeRow = (tracking = '', description = '', scanned = false) => ({
  id: rowId++,
  tracking,
  description,
  scanned,
})

export default function App() {
  const [rows, setRows] = useState([])
  const [scanInput, setScanInput] = useState('')
  const [sessionCount, setSessionCount] = useState(0)
  const [toasts, setToasts] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ups_settings') || '{}')
    } catch { return {} }
  })
  const [businessName, setBusinessName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [carrier, setCarrier] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('ups_settings') || '{}')
      return s.carrier === 'FedEx' ? 'FedEx' : 'UPS'
    } catch { return 'UPS' }
  })
  const [date, setDate] = useState(today())
  const [time, setTime] = useState(nowTime())
  const [pendingFileData, setPendingFileData] = useState(null)
  const [showMapper, setShowMapper] = useState(false)
  const [duplicateIds, setDuplicateIds] = useState(new Set())
  const scanRef = useRef(null)
  const beepRef = useRef(null)

  useEffect(() => {
    setBusinessName(settings.businessName || '')
    setBusinessAddress(settings.businessAddress || '')
    if (settings.carrier === 'UPS' || settings.carrier === 'FedEx') {
      setCarrier(settings.carrier)
    }
  }, [settings])

  const toggleCarrier = useCallback(() => {
    setCarrier(prev => {
      const next = prev === 'UPS' ? 'FedEx' : 'UPS'
      try {
        const stored = JSON.parse(localStorage.getItem('ups_settings') || '{}')
        stored.carrier = next
        localStorage.setItem('ups_settings', JSON.stringify(stored))
        setSettings(stored)
      } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    // Build audio context beep
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
      beepRef.current = () => {
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.15)
      }
    }
  }, [])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const computeDuplicates = useCallback((rowList) => {
    const seen = {}
    const dups = new Set()
    rowList.forEach(r => {
      const key = r.tracking.trim().toLowerCase()
      if (!key) return
      if (seen[key] !== undefined) {
        dups.add(seen[key])
        dups.add(r.id)
      } else {
        seen[key] = r.id
      }
    })
    return dups
  }, [])

  const addTrackingNumbers = useCallback((values) => {
    const nums = values.map(v => v.trim()).filter(Boolean)
    if (!nums.length) return 0
    let added = 0
    let dupCount = 0
    setRows(prev => {
      let updated = [...prev]
      nums.forEach(val => {
        const newRow = makeRow(val, '', true)
        updated.push(newRow)
        added++
      })
      const dups = computeDuplicates(updated)
      dupCount = dups.size
      setDuplicateIds(dups)
      return updated
    })
    setSessionCount(c => c + added)
    beepRef.current?.()
    if (dupCount > 0) addToast(`${dupCount} duplicate(s) highlighted in red`, 'warning')
    return added
  }, [computeDuplicates, addToast])

  const handleScan = useCallback((e) => {
    if (e.key !== 'Enter') return
    const val = scanInput.trim()
    if (!val) return
    setScanInput('')
    addTrackingNumbers([val])
    setTimeout(() => scanRef.current?.focus(), 0)
  }, [scanInput, addTrackingNumbers])

  const handlePaste = useCallback((e) => {
    const text = e.clipboardData.getData('text')
    // Split by tabs (Excel row) or newlines (Excel column)
    const values = text.split(/[\t\n\r]+/).map(v => v.trim()).filter(Boolean)
    if (values.length <= 1) return // single value — let normal input handle it
    e.preventDefault()
    setScanInput('')
    addTrackingNumbers(values)
    setTimeout(() => scanRef.current?.focus(), 0)
  }, [addTrackingNumbers])

  const updateRow = useCallback((id, field, value) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, [field]: value } : r)
      setDuplicateIds(computeDuplicates(updated))
      return updated
    })
  }, [computeDuplicates])

  const deleteRow = useCallback((id) => {
    setRows(prev => {
      const updated = prev.filter(r => r.id !== id)
      setDuplicateIds(computeDuplicates(updated))
      return updated
    })
  }, [computeDuplicates])

  const addBlankRow = useCallback(() => {
    setRows(prev => [...prev, makeRow()])
  }, [])

  const clearAll = useCallback(() => {
    setRows([])
    setSessionCount(0)
    setDuplicateIds(new Set())
    setScanInput('')
    setTimeout(() => scanRef.current?.focus(), 0)
  }, [])

  const handleFileData = useCallback((headers, data) => {
    setPendingFileData({ headers, data })
    setShowMapper(true)
  }, [])

  const handleMapConfirm = useCallback((trackingCol, descCol) => {
    if (!pendingFileData) return
    const newRows = pendingFileData.data
      .map(row => makeRow(
        String(row[trackingCol] || '').trim(),
        descCol ? String(row[descCol] || '').trim() : ''
      ))
      .filter(r => r.tracking)

    setRows(prev => {
      const updated = [...prev, ...newRows]
      setDuplicateIds(computeDuplicates(updated))
      return updated
    })
    setPendingFileData(null)
    setShowMapper(false)
    addToast(`Imported ${newRows.length} rows`, 'success')
  }, [pendingFileData, computeDuplicates, addToast])

  const handlePrint = useCallback(async () => {
    if (rows.length === 0) {
      addToast('Add at least one tracking number before printing', 'warning')
      return
    }

    const toEmail = (settings.toEmail || '').trim()
    const ccEmails = Array.isArray(settings.ccEmails)
      ? settings.ccEmails.map(e => String(e).trim()).filter(Boolean)
      : []

    const tableRows = rows.map((r, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(r.tracking)}</td><td>${escapeHtml(r.description) || '—'}</td></tr>`
    ).join('')

    const tracking_table_html = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial;font-size:13px;"><thead><tr style="background:#f0f0f0;"><th>#</th><th>Tracking Number</th><th>Description</th></tr></thead><tbody>${tableRows}</tbody></table>`

    const payload = {
      app_token: APP_TOKEN,
      date,
      time,
      carrier,
      business_name: businessName,
      to_email: toEmail,
      cc_emails: ccEmails,
      total_packages: rows.length,
      tracking_numbers: rows.map(r => ({ tracking: r.tracking, description: r.description })),
      tracking_table_html
    }

    if (!toEmail) {
      addToast('No recipient email set — open Settings to add one. Printing anyway.', 'warning')
    } else {
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Manifest-Token': APP_TOKEN
          },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const ccNote = ccEmails.length ? ` (+${ccEmails.length} CC)` : ''
        addToast(`Manifest emailed to ${toEmail}${ccNote} — opening print dialog`, 'success')
      } catch (err) {
        addToast(`Email failed: ${err.message} — printing anyway`, 'warning')
      }
    }

    printManifest({ carrier, businessName, businessAddress, date, time, rows })
  }, [settings, carrier, date, time, businessName, businessAddress, rows, addToast])

  const saveSettings = useCallback((newSettings) => {
    localStorage.setItem('ups_settings', JSON.stringify(newSettings))
    setSettings(newSettings)
    setShowSettings(false)
    addToast('Settings saved', 'success')
  }, [addToast])

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* ── PRINT-ONLY compact view ── */}
      <PrintView
        carrier={carrier}
        businessName={businessName}
        businessAddress={businessAddress}
        date={date}
        time={time}
        rows={rows}
      />

      {/* ── SCREEN-ONLY content ── */}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 no-print">
        {toasts.map(t => <Toast key={t.id} toast={t} />)}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <Settings
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Column mapper */}
      {showMapper && pendingFileData && (
        <ColumnMapper
          headers={pendingFileData.headers}
          onConfirm={handleMapConfirm}
          onCancel={() => { setShowMapper(false); setPendingFileData(null) }}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Top bar */}
        <div className="flex justify-between items-center mb-4 no-print">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md bg-neutral-900 text-neutral-50 flex items-center justify-center font-extrabold"
              style={{ fontFamily: 'Consolas, "Cascadia Mono", "JetBrains Mono", monospace', fontSize: '13px' }}
            >
              M
            </div>
            <span className="text-lg font-bold text-gray-800 tracking-tight">Manifest</span>
            <span className="text-xs text-gray-400 font-medium ml-1 hidden sm:inline">
              {carrier} pickup manifest
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Carrier toggle */}
            <div className="flex items-center bg-gray-200 rounded-full p-1 text-sm font-semibold">
              <button
                onClick={() => carrier !== 'UPS' && toggleCarrier()}
                className={`px-3 py-1 rounded-full transition ${
                  carrier === 'UPS' ? 'bg-neutral-900 text-white shadow' : 'text-gray-600 hover:text-gray-800'
                }`}
                title="Switch to UPS"
              >
                UPS
              </button>
              <button
                onClick={() => carrier !== 'FedEx' && toggleCarrier()}
                className={`px-3 py-1 rounded-full transition ${
                  carrier === 'FedEx' ? 'bg-neutral-900 text-white shadow' : 'text-gray-600 hover:text-gray-800'
                }`}
                title="Switch to FedEx"
              >
                FedEx
              </button>
            </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-gray-200 transition"
            title="Settings"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          </div>
        </div>

        {/* Manifest Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800 print-title">{carrier} Pickup Manifest</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                className="w-full border-b border-gray-300 bg-transparent px-1 py-1 text-gray-800 font-semibold focus:outline-none focus:border-blue-500 print:border-b print:border-black"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Business Address</label>
              <input
                type="text"
                value={businessAddress}
                onChange={e => setBusinessAddress(e.target.value)}
                className="w-full border-b border-gray-300 bg-transparent px-1 py-1 text-gray-800 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="border-b border-gray-300 bg-transparent px-1 py-1 text-gray-800 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="border-b border-gray-300 bg-transparent px-1 py-1 text-gray-800 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Scan input */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm no-print">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Scan Tracking Number
              </label>
              <input
                ref={scanRef}
                autoFocus
                type="text"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleScan}
                onPaste={handlePaste}
                placeholder="Scan or type tracking number, press Enter — or paste from Excel..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="text-center min-w-[110px]">
              <div className="bg-blue-600 text-white rounded-full px-3 py-1 text-sm font-bold">
                {sessionCount} scanned
              </div>
              <div className="text-xs text-gray-400 mt-1">this session</div>
            </div>
          </div>
        </div>

        {/* File uploader */}
        <div className="mb-4 no-print">
          <FileUploader onData={handleFileData} />
        </div>

        {/* Manifest Table */}
        <ManifestTable
          rows={rows}
          duplicateIds={duplicateIds}
          onUpdate={updateRow}
          onDelete={deleteRow}
          onAddRow={addBlankRow}
        />

        {/* Signature Section */}
        <SignatureSection carrier={carrier} />

        {/* Notes Section */}
        <NotesSection />

        {/* Footer */}
        <div className="mt-6 flex justify-between items-center border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-500 font-medium">Copy 1: Shipper — Copy 2: Driver</div>
          <div className="flex gap-3 no-print">
            <button
              onClick={clearAll}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition text-sm font-medium"
            >
              Clear All
            </button>
            <button
              onClick={handlePrint}
              disabled={rows.length === 0}
              title={rows.length === 0 ? 'Add at least one tracking number first' : 'Send email and open print dialog'}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
            >
              Print Manifest
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
