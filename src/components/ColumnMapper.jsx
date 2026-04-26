import { useState } from 'react'

// Convert 0-based index to Excel column letter (0=A, 25=Z, 26=AA, 38=AM, etc.)
function colLetter(i) {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export default function ColumnMapper({ headers, onConfirm, onCancel }) {
  const autoTracking = headers.find(h => /tracking/i.test(h)) || ''
  const autoDesc = headers.find(h => /desc/i.test(h)) || ''

  const [trackingCol, setTrackingCol] = useState(autoTracking)
  const [descCol, setDescCol] = useState(autoDesc)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-40 flex items-center justify-center no-print">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Map Columns</h2>
        <p className="text-xs text-gray-400 mb-4">Column letters match Excel (A, B, C… AM…)</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Tracking Number Column <span className="text-red-500">*</span>
            </label>
            <select
              value={trackingCol}
              onChange={e => setTrackingCol(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— select column —</option>
              {headers.map((h, i) => (
                <option key={i} value={h}>
                  {colLetter(i)} — {h || '(blank header)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Description Column <span className="text-gray-400">(optional)</span>
            </label>
            <select
              value={descCol}
              onChange={e => setDescCol(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— none —</option>
              {headers.map((h, i) => (
                <option key={i} value={h}>
                  {colLetter(i)} — {h || '(blank header)'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            disabled={!trackingCol}
            onClick={() => onConfirm(trackingCol, descCol || null)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition disabled:opacity-40"
          >
            Import Rows
          </button>
        </div>
      </div>
    </div>
  )
}
