import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'

export default function FileUploader({ onData }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const processFile = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      if (!json.length) return

      const headers = json[0].map(h => String(h || ''))
      const rows = json.slice(1).map(row => {
        const obj = {}
        headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
        return obj
      })
      onData(headers, rows)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleChange = (e) => {
    const file = e.target.files[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition
        ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleChange}
      />
      <p className="text-sm text-gray-500">
        <span className="font-semibold text-gray-700">Drop a spreadsheet here</span> or click to browse
        <span className="text-gray-400 ml-1">(.xlsx, .xls, .csv)</span>
      </p>
    </div>
  )
}
