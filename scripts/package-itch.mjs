import { deflateRawSync } from 'node:zlib';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(projectRoot, 'dist-itch');
const releaseDirectory = path.join(projectRoot, 'release');
const archivePath = path.join(releaseDirectory, 'n3ondefense-itch.zip');

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const absolutePath of files) {
    const archiveName = path.relative(sourceDirectory, absolutePath).split(path.sep).join('/');
    if (archiveName.startsWith('../') || path.isAbsolute(archiveName)) {
      throw new Error(`Refusing to package a file outside dist-itch: ${absolutePath}`);
    }

    const [contents, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    const compressed = deflateRawSync(contents, { level: 9 });
    const name = Buffer.from(archiveName, 'utf8');
    const checksum = crc32(contents);
    const { time, day } = dosTimestamp(metadata.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(day, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(day, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const indexPath = path.join(sourceDirectory, 'index.html');
await stat(indexPath).catch(() => {
  throw new Error('dist-itch/index.html is missing. Run npm run build:itch first.');
});

const files = (await listFiles(sourceDirectory)).sort((left, right) => left.localeCompare(right));
if (files.length > 0xffff) throw new Error('The itch package exceeds the ZIP entry limit.');

await mkdir(releaseDirectory, { recursive: true });
await rm(archivePath, { force: true });
await writeFile(archivePath, await createZip(files));

console.log(`Packaged ${files.length} files at ${path.relative(projectRoot, archivePath)}.`);
