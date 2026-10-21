const fs = require('fs')
const { execSync } = require('child_process')

// resize dengan .NET via powershell adalah susah ? guna approach: PNG sudah ada 512,
// kita perlukan 16/32/48. Guna electron-icon-builder? Tak ada. Buat manual dengan sharp? Tak installed.
// Paling mudah: install png-to-ico package
try { require.resolve('png-to-ico') } catch { execSync('npm install png-to-ico --no-save', { stdio: 'inherit' }) }

const pngToIco = require('png-to-ico')
const fs2 = require('fs')

// png-to-ico boleh terima multiple sizes ? resize dulu guna canvas takde.
// Dia resize sendiri dari satu PNG.
pngToIco('build/icon.png').then(buf => {
  fs2.writeFileSync('build/icon.ico', buf)
  console.log('icon.ico written:', buf.length, 'bytes')
  // verify
  const b = fs2.readFileSync('build/icon.ico')
  console.log('header:', b[0], b[1], b[2], b[3], '| count:', b[4], b[5])
  console.log('valid ICO type (1):', b[2] === 1 && b[3] === 0)
}).catch(e => console.error('FAILED:', e.message))
