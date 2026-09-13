import { ensureFFmpeg, ffmpeg, makeBlobURL } from './ffmpeg';

export const loadMediaMeta = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        const meta = { duration: Number.isFinite(v.duration) ? v.duration : 5, width: v.videoWidth, height: v.videoHeight, kind: 'video' };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read video metadata'));
      };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        const meta = { duration: 3, width: img.naturalWidth, height: img.naturalHeight, kind: 'image' };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };
      img.src = url;
    }
  });

export const XFADE_MAP = {
  none: 'fade',
  fade: 'fade',
  dissolve: 'dissolve',
  slide: 'wipeleft',
  zoom: 'zoomin',
  spin: 'circleopen',
  flash: 'fadewhite',
  wipe: 'slideleft',
  glitch: 'pixelize',
  smooth: 'smoothleft',
  circle: 'circleopen',
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const filterFor = (option) => {
  const map = {
    none: '',
    grayscale: 'hue=s=0',
    'b&w': 'hue=s=0',
    invert: 'negate',
    sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0',
    vintage: 'eq=gamma=1.3:saturation=0.7',
    bright: 'eq=brightness=0.12',
    dark: 'eq=brightness=-0.15',
    warm: 'colorbalance=rs=0.12:gs=0.05:bs=-0.12',
    cool: 'colorbalance=rs=-0.12:gs=-0.05:bs=0.12',
    cinematic: 'eq=contrast=1.12:brightness=-0.04:saturation=1.1',
  };
  return map[option] || '';
};

/**
 * Merge clips into one mp4.
 * clips: [{ name (ffmpeg fs path), kind, duration, start, meta: {duration}, fileBinary, filter }]
 */
export const runMerge = async (clips, opts) => {
  const W = opts.width || 1920;
  const H = opts.height || 1080;
  const fps = opts.fps || 30;
  const tDur = opts.transitionDuration || 0.5;
  const transition = XFADE_MAP[opts.transition] || 'fade';
  const music = opts.music;
  if (!clips.length) throw new Error('No clips selected');

  await ensureFFmpeg();

  const inputArgs = [];
  clips.forEach((c) => {
    if (c.kind === 'image') inputArgs.push('-loop', '1', '-t', String(c.duration), '-i', c.name);
    else inputArgs.push('-i', c.name);
  });
  if (music) inputArgs.push('-i', 'music.mp3');

  const n = clips.length;
  const out = ['-y', ...inputArgs, '-map'];

  if (n === 1) {
    out.push('0:v');
    const c = clips[0];
    const pre = c.vf || filterFor(c.filter);
    const vf = `${pre ? pre + ',' : ''}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,fps=${fps},setsar=1`;
    out.push('-vf', vf, '-t', String(c.duration));
  } else {
    const chains = clips.map((c, i) => `[${i}:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${(c.vf || filterFor(c.filter)) ? ',' + (c.vf || filterFor(c.filter)) : ''}[v${i}]`);
    const td = clamp(tDur, 0.05, Math.min(...clips.map((c) => c.duration)) || 0.5);
    let joins = '';
    let prev = '[v0]';
    let offset = clips[0].duration - td;
    for (let i = 1; i < n; i++) {
      const label = i === n - 1 ? 'outv' : `x${i}`;
      joins += `${prev}[v${i}]xfade=transition=${transition}:duration=${td.toFixed(3)}:offset=${Math.max(0.04, offset).toFixed(3)}[${label}];`;
      prev = `[${label}]`;
      offset += clips[i].duration - td;
    }
    out.push('[outv]');
    out.push('-filter_complex', [...chains, joins.slice(0, -1)].join(';'));
  }

  out.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  if (music) out.push('-map', `${n}:a`, '-c:a', 'aac', '-shortest');
  out.push('out.mp4');

  await ffmpeg.run(...out);
  return makeBlobURL('out.mp4', 'video/mp4');
};

/** Export canvas/dataURL to a video with optional music (Ken Burns style). dataUrl -> MP4 */
export const imageToVideo = async ({ dataUrl, width, height, fps = 30, duration = 5, zoom = true, filter = 'cinematic' }) => {
  await ensureFFmpeg();
  const b64 = dataUrl.split(',')[1];
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  ffmpeg.FS('writeFile', 'still.png', bytes);
  const frames = Math.round(duration * fps);
  const zoomExpr = zoom
    ? `z='min(zoom+${(0.9 / frames).toFixed(5)},1.18)':d=${frames}:s=${width}x${height}:fps=${fps}`
    : `z='1.0':d=${frames}:s=${width}x${height}:fps=${fps}`;
  const vf = `scale=3840:-1,zoompan=${zoomExpr},format=yuv420p${filter ? ',' + filterFor(filter) : ''}`;
  await ffmpeg.run('-y', '-loop', '1', '-i', 'still.png', '-t', String(duration), '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'out.mp4');
  return makeBlobURL('out.mp4', 'video/mp4');
};