export default function Toast({ toast }) {
  const colors = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-yellow-500 text-white',
  }
  return (
    <div className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-xs animate-fade-in ${colors[toast.type] || colors.success}`}>
      {toast.message}
    </div>
  )
}
