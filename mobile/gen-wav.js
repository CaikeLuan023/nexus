const fs = require('fs');
const sr = 44100;
const dur = 0.5;
const samples = Math.floor(sr * dur);
const dataSize = samples * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);
for (let i = 0; i < samples; i++) {
    const t = i / sr;
    const freq = t < 0.25 ? 880 : 1320;
    const env = Math.max(0, 1 - (t % 0.25) * 6);
    const val = Math.floor(Math.sin(2 * Math.PI * freq * t) * 16000 * env);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, val)), 44 + i * 2);
}
fs.writeFileSync(__dirname + '/assets/notification.wav', buf);
console.log('WAV created:', buf.length, 'bytes');
