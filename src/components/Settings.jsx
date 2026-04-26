import { useState } from 'react'

export default function Settings({ settings, onSave, onClose }) {
  const [businessName, setBusinessName] = useState(settings.businessName || '')
  const [businessAddress, setBusinessAddress] = useState(settings.businessAddress || '')
  const [toEmail, setToEmail] = useState(settings.toEmail || '')
  const [ccEmails, setCcEmails] = useState(() => {
    const list = Array.isArray(settings.ccEmails) ? settings.ccEmails.filter(Boolean) : []
    return list.length ? list : [''] // always show at least one blank row
  })

  const updateCc = (index, value) => {
    setCcEmails(prev => prev.map((e, i) => (i === index ? value : e)))
  }
  const addCc = () => {
    setCcEmails(prev => [...prev, ''])
  }
  const removeCc = (index) => {
    setCcEmails(prev => {
      const next = prev.filter((_, i) => i !== index)
      return next.length ? next : [''] // keep one blank row
    })
  }

  const handleSave = () => {
    const cleanedCc = ccEmails.map(e => e.trim()).filter(Boolean)
    onSave({
      ...settings,
      businessName: businessName.trim(),
      businessAddress: businessAddress.trim(),
      toEmail: toEmail.trim(),
      ccEmails: cleanedCc,
    })
  }

  const emailValid = (s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
  const toValid = emailValid(toEmail)
  const ccValidity = ccEmails.map(emailValid)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-40 flex items-center justify-center no-print p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-800">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none">&times;</button>
        </div>

        {/* Business Info */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Business Info</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your Company Name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Business Address</label>
              <input
                type="text"
                value={businessAddress}
                onChange={e => setBusinessAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="123 Main St, City, State 12345"
              />
            </div>
          </div>
        </div>

        {/* Email Delivery */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Email Delivery</div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Send Manifest To <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={toEmail}
              onChange={e => setToEmail(e.target.value)}
              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                toValid ? 'border-gray-300 focus:ring-blue-500' : 'border-red-400 focus:ring-red-400'
              }`}
              placeholder="dispatch@yourcompany.com"
            />
            {!toValid && (
              <p className="text-xs text-red-500 mt-1">Please enter a valid email address</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-gray-500">CC <span className="text-gray-400 font-normal">(optional)</span></label>
              <button
                type="button"
                onClick={addCc}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                + Add another
              </button>
            </div>
            <div className="space-y-2">
              {ccEmails.map((email, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => updateCc(idx, e.target.value)}
                    className={`flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                      ccValidity[idx] ? 'border-gray-300 focus:ring-blue-500' : 'border-red-400 focus:ring-red-400'
                    }`}
                    placeholder={idx === 0 ? 'manager@yourcompany.com' : 'another@example.com'}
                  />
                  <button
                    type="button"
                    onClick={() => removeCc(idx)}
                    className="px-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition"
                    title="Remove"
                    aria-label="Remove CC"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Every time you print, the manifest is emailed here with all CC addresses in copy.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!toValid || ccValidity.some(v => !v)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
