import { readFile } from 'node:fs/promises';

const port = Number(process.argv[2] || 9225);
const expression = process.argv[3] === '--file'
  ? await readFile(process.argv[4], 'utf8')
  : process.argv.slice(3).join(' ');
if (!expression) throw new Error('Pass a Runtime.evaluate expression.');

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No debuggable page found.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const response = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('CDP evaluation timed out.')), 60_000);
  socket.addEventListener('open', () => socket.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true }
  })));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout);
    resolve(message);
  });
  socket.addEventListener('error', reject);
});
socket.close();
console.log(JSON.stringify(response, null, 2));
