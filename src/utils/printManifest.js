export function printManifest({ carrier = 'UPS', businessName, businessAddress, date, time, rows }) {
  const rowsHTML = rows.map((row, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#f7f7f7'}">
      <td style="border:1px solid #bbb;padding:2px 5px;text-align:center;color:#555;font-size:8pt">${idx + 1}</td>
      <td style="border:1px solid #bbb;padding:2px 6px;font-family:monospace;font-size:8.5pt">${row.tracking || ''}</td>
      <td style="border:1px solid #bbb;padding:2px 6px;font-size:8.5pt">${row.description || ''}</td>
      <td style="border:1px solid #bbb;padding:2px 4px;text-align:center">
        <input type="checkbox" ${row.scanned ? 'checked' : ''} style="width:11px;height:11px">
      </td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${carrier} Pickup Manifest</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
    @page { size: letter portrait; margin: 0.45in 0.5in; }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px">
    <div style="text-align:center;font-size:14pt;font-weight:bold;margin-bottom:4px">${carrier} Pickup Manifest</div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
      <tr>
        <td style="width:28%;padding-right:10px">
          <div style="font-size:6.5pt;text-transform:uppercase;color:#555;margin-bottom:1px">Business Name</div>
          <strong>${businessName || ''}</strong>
        </td>
        <td style="width:42%;padding-right:10px">
          <div style="font-size:6.5pt;text-transform:uppercase;color:#555;margin-bottom:1px">Business Address</div>
          ${businessAddress || ''}
        </td>
        <td style="width:15%;padding-right:10px">
          <div style="font-size:6.5pt;text-transform:uppercase;color:#555;margin-bottom:1px">Date</div>
          ${date || ''}
        </td>
        <td style="width:15%">
          <div style="font-size:6.5pt;text-transform:uppercase;color:#555;margin-bottom:1px">Time</div>
          ${time || ''}
        </td>
      </tr>
    </table>
  </div>

  <!-- Table -->
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:5px">
    <thead>
      <tr style="background:#ddd">
        <th style="border:1px solid #888;padding:2px 5px;width:30px;text-align:center;font-size:7.5pt">#</th>
        <th style="border:1px solid #888;padding:2px 8px;font-size:7.5pt;text-align:left">Tracking Number</th>
        <th style="border:1px solid #888;padding:2px 8px;font-size:7.5pt;text-align:left">Description</th>
        <th style="border:1px solid #888;padding:2px 4px;width:55px;text-align:center;font-size:7.5pt">Scanned</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>

  <!-- Total -->
  <div style="font-size:8pt;border-top:1px solid #aaa;padding-top:2px;margin-bottom:7px">
    <strong>Total: ${rows.length} package${rows.length !== 1 ? 's' : ''}</strong>
  </div>

  <!-- Signatures -->
  <div style="border-top:1px solid #000;padding-top:5px;margin-bottom:6px">
    <p style="font-size:7.5pt;font-style:italic;margin-bottom:6px">
      By signing below, the ${carrier} driver confirms that all packages listed above were physically collected and scanned at time of pickup.
    </p>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="width:50%;padding-right:18px;padding-bottom:8px">
          <div style="font-size:7pt;text-transform:uppercase;color:#444;margin-bottom:2px">Driver Name (Print)</div>
          <div style="border-bottom:1px solid #000;height:20px"></div>
        </td>
        <td style="width:50%;padding-bottom:8px">
          <div style="font-size:7pt;text-transform:uppercase;color:#444;margin-bottom:2px">Driver Employee / Badge ID</div>
          <div style="border-bottom:1px solid #000;height:20px"></div>
        </td>
      </tr>
      <tr>
        <td style="padding-right:18px;padding-bottom:4px">
          <div style="font-size:7pt;text-transform:uppercase;color:#444;margin-bottom:2px">Driver Signature</div>
          <div style="border-bottom:1px solid #000;height:26px"></div>
        </td>
        <td style="padding-bottom:4px">
          <div style="font-size:7pt;text-transform:uppercase;color:#444;margin-bottom:2px">Received By (Staff)</div>
          <div style="border-bottom:1px solid #000;height:26px"></div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Notes -->
  <div style="border-top:1px solid #999;padding-top:4px;margin-bottom:5px">
    <div style="font-size:7pt;text-transform:uppercase;font-weight:bold;color:#444;margin-bottom:4px">Notes / Discrepancies</div>
    <div style="border-bottom:1px solid #aaa;height:18px;margin-bottom:6px"></div>
    <div style="border-bottom:1px solid #aaa;height:18px"></div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #000;padding-top:3px;font-size:7.5pt;color:#444">
    Copy 1: Shipper — Copy 2: Driver
  </div>

</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 300)
}
