// Clean serial-number printout — same crisp table style as the manifest, but
// with no manifest header, business info, carrier, signatures, notes or
// branding. Just a numbered list of scanned serials and a total.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export function printSerials({ serials }) {
  const rowsHTML = serials.map((s, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#f7f7f7'}">
      <td style="border:1px solid #bbb;padding:3px 6px;text-align:center;color:#555;font-size:8pt;width:34px">${idx + 1}</td>
      <td style="border:1px solid #bbb;padding:3px 8px;font-family:monospace;font-size:9.5pt">${esc(s)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Serial Numbers</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
    @page { size: letter portrait; margin: 0.5in; }
  </style>
</head>
<body>
  <div style="font-size:13pt;font-weight:bold;margin-bottom:6px">Serial Numbers</div>
  <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:5px">
    <thead>
      <tr style="background:#ddd">
        <th style="border:1px solid #888;padding:3px 6px;width:34px;text-align:center;font-size:8pt">#</th>
        <th style="border:1px solid #888;padding:3px 8px;font-size:8pt;text-align:left">Serial Number</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div style="font-size:8.5pt;border-top:1px solid #aaa;padding-top:3px">
    <strong>Total: ${serials.length}</strong>
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
