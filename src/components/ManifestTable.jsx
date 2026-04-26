export default function ManifestTable({ rows, duplicateIds, onUpdate, onDelete, onAddRow }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider">
              <th className="px-3 py-3 text-left w-10">#</th>
              <th className="px-3 py-3 text-left">Tracking Number</th>
              <th className="px-3 py-3 text-left">Description</th>
              <th className="px-3 py-3 text-center w-20">Scanned</th>
              <th className="px-3 py-3 text-center w-12 no-print">Del</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                  No packages yet — scan a barcode or upload a file
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const isDup = duplicateIds.has(row.id)
              return (
                <tr
                  key={row.id}
                  className={`border-t border-gray-100 ${isDup ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                >
                  <td className={`px-3 py-2 text-gray-400 font-mono text-xs ${isDup ? 'text-red-500' : ''}`}>
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.tracking}
                      onChange={e => onUpdate(row.id, 'tracking', e.target.value)}
                      className={`w-full bg-transparent border-b focus:outline-none focus:border-blue-500 font-mono text-sm py-0.5 ${isDup ? 'border-red-400 text-red-700' : 'border-transparent hover:border-gray-300'}`}
                    />
                    {isDup && <div className="text-red-500 text-xs mt-0.5">Duplicate</div>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => onUpdate(row.id, 'description', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:outline-none focus:border-blue-500 text-sm py-0.5"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.scanned}
                      onChange={e => onUpdate(row.id, 'scanned', e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-center no-print">
                    <button
                      onClick={() => onDelete(row.id)}
                      className="text-gray-400 hover:text-red-500 transition font-bold text-lg leading-none"
                      title="Delete row"
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
      <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
        <div className="text-sm text-gray-600 font-medium">
          Total: <span className="font-bold text-gray-800">{rows.length}</span> package{rows.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={onAddRow}
          className="no-print flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium transition"
        >
          <span className="text-lg leading-none">+</span> Add Row
        </button>
      </div>
    </div>
  )
}
