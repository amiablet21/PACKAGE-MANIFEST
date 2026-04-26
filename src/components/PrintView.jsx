// This component is ONLY visible when printing (hidden on screen).
// It renders a compact layout designed to fit 100+ rows in 1-2 pages.
export default function PrintView({ carrier = 'UPS', businessName, businessAddress, date, time, rows }) {
  return (
    <div id="print-view">
      {/* ── Header ── */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '4px', marginBottom: '5px' }}>
        <div style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 'bold', marginBottom: '3px' }}>
          {carrier} Pickup Manifest
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '25%', paddingRight: '8px' }}>
                <span style={{ fontSize: '6.5pt', textTransform: 'uppercase', color: '#555', display: 'block' }}>Business Name</span>
                <strong>{businessName || '___________________________'}</strong>
              </td>
              <td style={{ width: '45%', paddingRight: '8px' }}>
                <span style={{ fontSize: '6.5pt', textTransform: 'uppercase', color: '#555', display: 'block' }}>Business Address</span>
                {businessAddress || '___________________________'}
              </td>
              <td style={{ width: '15%', paddingRight: '8px' }}>
                <span style={{ fontSize: '6.5pt', textTransform: 'uppercase', color: '#555', display: 'block' }}>Date</span>
                {date}
              </td>
              <td style={{ width: '15%' }}>
                <span style={{ fontSize: '6.5pt', textTransform: 'uppercase', color: '#555', display: 'block' }}>Time</span>
                {time}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Tracking Table ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', marginBottom: '5px' }}>
        <thead>
          <tr style={{ backgroundColor: '#e0e0e0' }}>
            <th style={{ border: '1px solid #888', padding: '2px 4px', width: '28px', textAlign: 'center', fontSize: '7.5pt' }}>#</th>
            <th style={{ border: '1px solid #888', padding: '2px 6px', fontSize: '7.5pt' }}>Tracking Number</th>
            <th style={{ border: '1px solid #888', padding: '2px 6px', fontSize: '7.5pt' }}>Description</th>
            <th style={{ border: '1px solid #888', padding: '2px 4px', width: '52px', textAlign: 'center', fontSize: '7.5pt' }}>Scanned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
              <td style={{ border: '1px solid #bbb', padding: '1px 4px', textAlign: 'center', color: '#666', fontSize: '7.5pt' }}>{idx + 1}</td>
              <td style={{ border: '1px solid #bbb', padding: '1px 6px', fontFamily: 'monospace', fontSize: '8pt' }}>{row.tracking}</td>
              <td style={{ border: '1px solid #bbb', padding: '1px 6px', fontSize: '8pt' }}>{row.description}</td>
              <td style={{ border: '1px solid #bbb', padding: '1px 4px', textAlign: 'center' }}>
                <input type="checkbox" defaultChecked={row.scanned} style={{ width: '11px', height: '11px' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div style={{ fontSize: '8pt', marginBottom: '6px', borderTop: '1px solid #aaa', paddingTop: '2px' }}>
        <strong>Total: {rows.length} package{rows.length !== 1 ? 's' : ''}</strong>
      </div>

      {/* ── Signature Section ── */}
      <div style={{ borderTop: '1px solid #000', paddingTop: '4px', marginBottom: '5px' }}>
        <p style={{ fontSize: '7.5pt', fontStyle: 'italic', margin: '0 0 5px 0' }}>
          By signing below, the {carrier} driver confirms that all packages listed above were physically collected and scanned at time of pickup.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', paddingRight: '16px', paddingBottom: '6px' }}>
                <div style={{ fontSize: '7pt', textTransform: 'uppercase', color: '#555', marginBottom: '2px' }}>Driver Name (Print)</div>
                <div style={{ borderBottom: '1px solid #000', height: '18px' }} />
              </td>
              <td style={{ width: '50%', paddingBottom: '6px' }}>
                <div style={{ fontSize: '7pt', textTransform: 'uppercase', color: '#555', marginBottom: '2px' }}>Driver Employee / Badge ID</div>
                <div style={{ borderBottom: '1px solid #000', height: '18px' }} />
              </td>
            </tr>
            <tr>
              <td style={{ paddingRight: '16px', paddingBottom: '4px' }}>
                <div style={{ fontSize: '7pt', textTransform: 'uppercase', color: '#555', marginBottom: '2px' }}>Driver Signature</div>
                <div style={{ borderBottom: '1px solid #000', height: '22px' }} />
              </td>
              <td style={{ paddingBottom: '4px' }}>
                <div style={{ fontSize: '7pt', textTransform: 'uppercase', color: '#555', marginBottom: '2px' }}>Received By (Staff)</div>
                <div style={{ borderBottom: '1px solid #000', height: '22px' }} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Notes ── */}
      <div style={{ borderTop: '1px solid #999', paddingTop: '3px', marginBottom: '4px' }}>
        <div style={{ fontSize: '7pt', textTransform: 'uppercase', fontWeight: 'bold', color: '#555', marginBottom: '3px' }}>Notes / Discrepancies</div>
        <div style={{ borderBottom: '1px solid #aaa', height: '16px', marginBottom: '5px' }} />
        <div style={{ borderBottom: '1px solid #aaa', height: '16px' }} />
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid #000', paddingTop: '3px', fontSize: '7.5pt', color: '#444' }}>
        Copy 1: Shipper — Copy 2: Driver
      </div>
    </div>
  )
}
