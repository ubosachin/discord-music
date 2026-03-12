/**
 * Converts Netscape cookies.txt format → JSON array for @distube/ytdl-core
 */
const fs   = require('fs');
const path = require('path');

const inputFile  = path.join(__dirname, '../cookies.json.example');
const outputFile = path.join(__dirname, '../cookies.json');

const raw = fs.readFileSync(inputFile, 'utf8');
const cookies = [];

for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 7) continue;

    const [domain, , path_, secureStr, expiresStr, name, ...valueParts] = parts;
    const value = valueParts.join('\t'); // value may contain tabs

    cookies.push({
        name:           name.trim(),
        value:          value.trim(),
        domain:         domain.trim(),
        path:           path_.trim(),
        secure:         secureStr.trim().toUpperCase() === 'TRUE',
        httpOnly:       false,
        sameSite:       'None',
        expirationDate: parseInt(expiresStr.trim()) || 9999999999,
    });
}

fs.writeFileSync(outputFile, JSON.stringify(cookies, null, 2));
console.log(`✅ Converted ${cookies.length} cookies → cookies.json`);
cookies.slice(0, 5).forEach(c => console.log(`  • ${c.name} (${c.domain})`));
