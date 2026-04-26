export default function NotesSection() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Notes / Discrepancies
      </div>
      <div className="border border-gray-200 rounded min-h-[72px] p-2 no-print">
        <textarea
          className="w-full resize-none text-sm text-gray-700 focus:outline-none bg-transparent"
          rows={3}
          placeholder="Any notes or discrepancies..."
        />
      </div>
      {/* Print version shows blank lines */}
      <div className="hidden print:block">
        <div className="border-b border-gray-400 h-8 mb-3" />
        <div className="border-b border-gray-400 h-8" />
      </div>
    </div>
  )
}
