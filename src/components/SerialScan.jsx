import React, { useState, useRef, useEffect, useCallback } from 'react'
import { printScanSheet } from '../utils/printSerials'

let uid = 1
const nextId = () => uid++

const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem('serial_scan_settings') || '{}') }
  catch { return {} }
}

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// A configurable barcode/serial scanner — set a title, define columns, scan
// into the first column (the rest are editable per row), then print or export
// a CSV. The printout/CSV carry only the title + columns — no manifest branding.
// Opens as a full-screen overlay from the manifest page.
export default function SerialScan({ onClose, addToast, beep }) {
  const saved = loadSettings()
  const [title, setTitle] = useState(saved.title || 'Serial Numbers')
  const [columns, setColumns] = useState(() => {
    const cols = Array.isArray(saved.columns) && saved.columns.length
      ? saved.columns
      : [{ id: nextId(), name: 'Serial Number' }]
    cols.forEach(c => { if (typeof c.id === 'number' && c.id >= uid) uid = c.id + 1 })
    return cols
  })
  const [rows, setRows] = useState([])   // [{ id, cells: { [colId]: value } }]
  const [input, setInput] = useState('')
  const scanRef = useRef(null)

  // Remember the title + columns for next time (defaults), like the other tabs.
  useEffect(() => {
    localStorage.setItem('serial_scan_settings', JSON.stringify({ title, columns }))
  }, [title, columns])

  const add = useCallback((values) => {
    const vals = values.map(v => v.trim()).filter(Boolean)
    if (!vals.length) return
    const col0 = columns[0]?.id
    setRows(prev => [...prev, ...vals.map(v => ({ id: nextId(), cells: col0 != null ? { [col0]: v } : {} }))])
    beep?.()
  }, [columns, beep])

  const handleKey = (e) => {
    if (e.key !== 'Enter') return
    const v = input.trim()
    if (!v) return
    setInput('')
    add([v])
    setTimeout(() => scanRef.current?.focus(), 0)
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    const vals = text.split(/[\t\n\r]+/).map(v => v.trim()).filter(Boolean)
    if (vals.length <= 1) return
    e.preventDefault()
    setInput('')
    add(vals)
    setTimeout(() => scanRef.current?.focus(), 0)
  }

  const setCell = (rowId, colId, value) =>
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r))

  const delRow = (rowId) => setRows(prev => prev.filter(r => r.id !== rowId))

  const renameColumn = (colId, name) =>
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, name } : c))

  const addColumn = () =>
    setColumns(prev => [...prev, { id: nextId(), name: `Column ${prev.length + 1}` }])

  const removeColumn = (colId) =>
    setColumns(prev => (prev.length > 1 ? prev.filter(c => c.id !== colId) : prev))

  const clear = () => {
    setRows([])
    setInput('')
    setTimeout(() => scanRef.current?.focus(), 0)
  }

  const matrix = () => rows.map(r => columns.map(c => r.cells[c.id] ?? ''))

  const downloadCsv = () => {
    if (!rows.length) {
      addToast('Scan at least one value first', 'warning')
      return
    }
    const headers = columns.map(c => c.name)
    const csv = [headers, ...matrix()].map(r => r.map(csvEscape).join(',')).join('\r\n')
    const slug = (title.trim() || 'scan').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'scan'
    const stamp = new Date().toISOString().slice(0, 10)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}_${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    addToast(`Downloaded ${rows.length} row(s) as CSV`, 'success')
  }

  const print = () => {
    if (!rows.length) {
      addToast('Scan at least one value first', 'warning')
      return
    }
    printScanSheet({ title: title.trim() || 'Scan', headers: columns.map(c => c.name), rows: matrix() })
  }

  const scanColName = columns[0]?.name || 'value'

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-800">Scan Sheet</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md hover:bg-gray-200 text-gray-600 text-sm font-medium"
          >
            ✕ Close
          </button>
        </div>

        {/* Title */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. June Returns, IMEI list…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-400 mt-2">Used as the heading, the print title, and the CSV file name. Saved for next time.</p>
        </div>

        {/* Scan input */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Scan {scanColName}
              </label>
              <input
                ref={scanRef}
                autoFocus
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                onPaste={handlePaste}
                placeholder={`Scan or type a ${scanColName.toLowerCase()}, press Enter — or paste a list…`}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="text-center min-w-[110px]">
              <div className="bg-blue-600 text-white rounded-full px-3 py-1 text-sm font-bold">
                {rows.length} scanned
              </div>
              <div className="text-xs text-gray-400 mt-1">this session</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Columns</span>
            <button onClick={addColumn} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Add column
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider">
                  <th className="px-3 py-2 text-left w-10">#</th>
                  {columns.map((c, ci) => (
                    <th key={c.id} className="px-3 py-2 text-left">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={c.name}
                          onChange={e => renameColumn(c.id, e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-xs font-semibold uppercase tracking-wider py-0.5"
                        />
                        {columns.length > 1 && (
                          <button
                            onClick={() => removeColumn(c.id)}
                            className="text-gray-300 hover:text-red-500 font-bold leading-none"
                            title="Remove column"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {ci === 0 && <span className="text-[10px] text-blue-500 normal-case font-medium">↵ scans here</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center w-12">Del</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="text-center py-10 text-gray-400 text-sm">
                      No rows yet — scan a barcode
                    </td>
                  </tr>
                )}
                {rows.map((r, idx) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1 text-gray-400 font-mono text-xs">{idx + 1}</td>
                    {columns.map((c, ci) => (
                      <td key={c.id} className="px-3 py-1">
                        <input
                          type="text"
                          value={r.cells[c.id] ?? ''}
                          onChange={e => setCell(r.id, c.id, e.target.value)}
                          className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm py-0.5 ${ci === 0 ? 'font-mono' : ''}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1 text-center">
                      <button
                        onClick={() => delRow(r.id)}
                        className="text-gray-400 hover:text-red-500 transition font-bold text-lg leading-none"
                        title="Delete row"
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
              Total: <span className="font-bold text-gray-800">{rows.length}</span> row{rows.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex justify-end items-center gap-3 border-t border-gray-200 pt-4">
          <button
            onClick={clear}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition text-sm font-medium"
          >
            Clear
          </button>
          <button
            onClick={downloadCsv}
            disabled={rows.length === 0}
            title={rows.length === 0 ? 'Scan at least one value first' : 'Download as CSV'}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download CSV
          </button>
          <button
            onClick={print}
            disabled={rows.length === 0}
            title={rows.length === 0 ? 'Scan at least one value first' : 'Print the sheet'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  )
}
