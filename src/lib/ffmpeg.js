import { FFmpeg } from '@ffmpeg/ffmpeg';

export const ffmpeg = new FFmpeg();
let loadedFlag = false;
const loggers = [];

const toBlobURL = async (url, mimeType) => {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
};

ffmpeg.on('log', ({ message }) => loggers.forEach((l) => l && l(message)));

export const onFFLog = (cb) => {
  loggers.push(cb);
  return () => {
    const i = loggers.indexOf(cb);
    if (i >= 0) loggers.splice(i, 1);
  };
};

export const ensureFFmpeg = async () => {
  if (loadedFlag) return true;
  const base = window.location.origin + '/ffmpeg';
  const coreURL = await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript');
  const wasmURL = await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm');
  await ffmpeg.load({ coreURL, wasmURL });
  loadedFlag = true;
  return true;
};

export const ffLoaded = () => loadedFlag;

export const toUint8 = async (file) => new Uint8Array(await file.arrayBuffer());

export const readFF = (path) => {
  const data = ffmpeg.FS('readFile', path);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

export const writeFF = (path, data) => ffmpeg.FS('writeFile', path, data);

export const makeBlobURL = (path, mime) =>
  URL.createObjectURL(new Blob([readFF(path)], { type: mime }));