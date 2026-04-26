export default function SignatureSection({ carrier = 'UPS' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm print-signature-section">
      <p className="text-sm text-gray-600 mb-5 italic">
        By signing below, the {carrier} driver confirms that all packages listed above were physically
        collected and scanned at time of pickup.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          'Driver Name (Print)',
          'Driver Employee / Badge ID',
          'Driver Signature',
          'Received By (Staff)',
        ].map(label => (
          <div key={label}>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">{label}</div>
            <div className="border-b-2 border-gray-300 h-8 print-signature-line" />
          </div>
        ))}
      </div>
    </div>
  )
}
