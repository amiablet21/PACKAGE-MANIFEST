import React, { useState, useRef, useCallback } from 'react'
import { printSerials } from '../utils/printSerials'

let sid = 1

// A plain barcode/serial scanner — scan serials, print a clean numbered list.
// No manifest header, business info, carrier, signatures, notes or branding.
// Opens as a full-screen overlay from the manifest page.
export default function SerialScan({ onClose, addToast, beep }) {
  const [serials, setSerials] = useState([])   // [{ id, value }]
  const [input, setInput] = useState('')
  const scanRef = useRef(null)

  const add = useCallback((values) => {
    const vals = values.map(v => v.trim()).filter(Boolean)
    if (!vals.length) return
    setSerials(prev => [...prev, ...vals.map(v => ({ id: sid++, value: v }))])
    beep?.()
  }, [beep])

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

  const del = (id) => setSerials(prev => prev.filter(s => s.id !== id))

  const clear = () => {
    setSerials([])
    setInput('')
    setTimeout(() => scanRef.current?.focus(), 0)
  }

  const print = () => {
    if (!serials.length) {
      addToast('Scan at least one serial first', 'warning')
      return
    }
    printSerials({ serials: serials.map(s => s.value) })
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-800">Serial Number Scan</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md hover:bg-gray-200 text-gray-600 text-sm font-medium"
          >
            ✕ Close
          </button>
        </div>

        {/* Scan input */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Scan Serial Number
              </label>
              <input
                ref={scanRef}
                autoFocus
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                onPaste={handlePaste}
                placeholder="Scan or type a serial number, press Enter — or paste a list…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="text-center min-w-[110px]">
              <div className="bg-blue-600 text-white rounded-full px-3 py-1 text-sm font-bold">
                {serials.length} scanned
              </div>
              <div className="text-xs text-gray-400 mt-1">this session</div>
            </div>
          </div>
        </div>

        {/* Serial table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider">
                  <th className="px-3 py-3 text-left w-10">#</th>
                  <th className="px-3 py-3 text-left">Serial Number</th>
                  <th className="px-3 py-3 text-center w-12">Del</th>
                </tr>
              </thead>
              <tbody>
                {serials.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-gray-400 text-sm">
                      No serials yet — scan a barcode
                    </td>
                  </tr>
                )}
                {serials.map((s, idx) => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-sm text-gray-800">{s.value}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => del(s.id)}
                        className="text-gray-400 hover:text-red-500 transition font-bold text-lg leading-none"
                        title="Delete serial"
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
              Total: <span className="font-bold text-gray-800">{serials.length}</span> serial{serials.length !== 1 ? 's' : ''}
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
            onClick={print}
            disabled={serials.length === 0}
            title={serials.length === 0 ? 'Scan at least one serial first' : 'Print the serial list'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  )
}
