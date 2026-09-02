/**
 * GHOST WRITER — Binary Pixel POV Noise Engine & Instant 10s MP4 Video Exporter
 * 
 * Inspired by "Bad Apple!! but it disappears if you pause it" / Lost in the Static
 * 
 * 1. Instant 10s MP4 Export: Uses WebCodecs hardware H.264 VideoEncoder & Mp4Muxer
 *    to generate and download a standard, universal .mp4 video in < 0.3s on click.
 * 2. 100% Clean Canvas: All controls and pause notifications live OUTSIDE the video screen.
 * 3. Binary Pixel Noise: Canvas is composed of high-density black (0) & white (1) pixels.
 * 4. 100% Camouflage on Pause: Freezes into pure television static.
 */

// ==========================================
// 1. Color Palettes (0 = Low / Background, 1 = High / Pixel)
// ==========================================
const PALETTES = {
  bw: {
    c0: [0, 0, 0, 255],         // Black
    c1: [255, 255, 255, 255],   // Pure White
    accent: '#ffffff'
  },
  matrix: {
    c0: [2, 11, 6, 255],        // Deep Black-Green
    c1: [16, 185, 129, 255],    // Neon Phosphor
    accent: '#10b981'
  },
  cyber: {
    c0: [3, 8, 20, 255],        // Deep Navy
    c1: [0, 240, 255, 255],     // Electric Cyan
    accent: '#00f0ff'
  },
  amber: {
    c0: [12, 8, 2, 255],        // Deep CRT Brown
    c1: [245, 158, 11, 255],    // CRT Amber
    accent: '#f59e0b'
  },
  crimson: {
    c0: [12, 3, 6, 255],        // Deep Crimson Black
    c1: [244, 63, 94, 255],     // Neon Red
    accent: '#f43f5e'
  }
};

// ==========================================
// 2. High-Speed 2D Integer Hash for Binary Noise
// ==========================================
function hash2DBit(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1013904223) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 1; // 0 or 1
}

// ==========================================
// 3. Offscreen Text Mask Generator
// ==========================================
class TextMask {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.width = 0;
    this.height = 0;
    this.maskData = null;
    this.coveragePct = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  generate(text) {
    if (!this.width || !this.height) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const cleanText = (text || '').trim().toUpperCase();
    if (!cleanText) {
      this.maskData = null;
      this.coveragePct = 0;
      return;
    }

    const maxW = this.width * 0.88;
    const maxH = this.height * 0.78;
    const words = cleanText.split(/\s+/);
    
    // Auto-fit font size
    let minFontSize = 20;
    let maxFontSize = Math.min(this.width * 0.22, this.height * 0.45, 160);
    let bestFontSize = minFontSize;
    let bestLines = [cleanText];

    for (let testSize = maxFontSize; testSize >= minFontSize; testSize -= 2) {
      ctx.font = `900 ${testSize}px "Outfit", "Arial Black", "Montserrat", sans-serif`;
      
      const lines = [];
      let currentLine = '';
      let fits = true;

      for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxW) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
            const singleWordMetrics = ctx.measureText(words[i]);
            if (singleWordMetrics.width > maxW) {
              fits = false;
              break;
            }
          } else {
            fits = false;
            break;
          }
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) lines.push(currentLine);

      const totalH = lines.length * (testSize * 1.18);
      if (fits && totalH <= maxH) {
        bestFontSize = testSize;
        bestLines = lines;
        break;
      }
    }

    // Render solid white mask
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${bestFontSize}px "Outfit", "Arial Black", "Montserrat", sans-serif`;

    const lineHeight = bestFontSize * 1.18;
    const totalHeight = bestLines.length * lineHeight;
    const startY = (this.height - totalHeight) / 2 + (lineHeight / 2);

    bestLines.forEach((line, index) => {
      ctx.fillText(line, this.width / 2, startY + (index * lineHeight));
    });

    // Extract pixel buffer
    const imgData = ctx.getImageData(0, 0, this.width, this.height);
    this.maskData = imgData.data;

    let activePixels = 0;
    const totalPixels = this.width * this.height;
    for (let i = 3; i < this.maskData.length; i += 4) {
      if (this.maskData[i] > 100) activePixels++;
    }
    this.coveragePct = totalPixels > 0 ? (activePixels / totalPixels) * 100 : 0;
  }

  isInside(x, y) {
    if (!this.maskData) return false;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || px >= this.width || py < 0 || py >= this.height) return false;
    const idx = (py * this.width + px) * 4;
    return this.maskData[idx + 3] > 100;
  }
}

// ==========================================
// 4. Binary Pixel Noise Engine
// ==========================================
class MotionEngine {
  constructor(canvas, textMask) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.textMask = textMask;

    // Offscreen pixel buffer
    this.pixelCanvas = document.createElement('canvas');
    this.pixelCtx = this.pixelCanvas.getContext('2d', { willReadFrequently: true });
    this.imageData = null;
    this.pixelBuffer32 = null;

    this.width = 0;
    this.height = 0;
    this.pixelW = 0;
    this.pixelH = 0;

    // Bitmask lookup grid
    this.maskGrid = null;

    // Base noise seed
    this.seed = Math.floor(Math.random() * 100000);

    // Parameters
    this.params = {
      text: 'HELLO WORLD',
      pixelSize: 2,
      textRefreshRate: 60,
      bgRefreshRate: 2,
      theme: 'bw',
      showMask: false,
      isPlaying: true
    };

    // State
    this.elapsedTime = 0;
    this.lastTimestamp = 0;
    this.fps = 60;
    this.fpsAlpha = 0.08;
  }

  init() {
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = Math.max(300, Math.floor(rect.width));
    this.height = Math.max(300, Math.floor(rect.height));

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.textMask.resize(this.width, this.height);
    this.textMask.generate(this.params.text);
    this.buildPixelBuffer();
  }

  buildPixelBuffer() {
    const pSize = this.params.pixelSize;
    this.pixelW = Math.max(20, Math.floor(this.width / pSize));
    this.pixelH = Math.max(20, Math.floor(this.height / pSize));

    this.pixelCanvas.width = this.pixelW;
    this.pixelCanvas.height = this.pixelH;

    this.imageData = this.pixelCtx.createImageData(this.pixelW, this.pixelH);
    this.pixelBuffer32 = new Uint32Array(this.imageData.data.buffer);

    const totalPixels = this.pixelW * this.pixelH;
    this.maskGrid = new Uint8Array(totalPixels);

    for (let y = 0; y < this.pixelH; y++) {
      const screenY = (y + 0.5) * pSize;
      const rowOffset = y * this.pixelW;
      for (let x = 0; x < this.pixelW; x++) {
        const screenX = (x + 0.5) * pSize;
        this.maskGrid[rowOffset + x] = this.textMask.isInside(screenX, screenY) ? 1 : 0;
      }
    }
  }

  reseed() {
    this.seed = Math.floor(Math.random() * 100000);
  }

  renderFrame(t, targetCtx = this.ctx, targetW = this.width, targetH = this.height) {
    if (!this.pixelBuffer32) return;

    const seed = this.seed;
    const textRate = this.params.textRefreshRate;
    const bgRate = this.params.bgRefreshRate;
    const theme = PALETTES[this.params.theme] || PALETTES.bw;

    const c0 = (theme.c0[3] << 24) | (theme.c0[2] << 16) | (theme.c0[1] << 8) | theme.c0[0];
    const c1 = (theme.c1[3] << 24) | (theme.c1[2] << 16) | (theme.c1[1] << 8) | theme.c1[0];

    const buf = this.pixelBuffer32;
    const mask = this.maskGrid;
    const W = this.pixelW;
    const H = this.pixelH;

    const textFrame = Math.floor(t * textRate);
    const bgFrame = bgRate > 0 ? Math.floor(t * bgRate) : 0;

    let idx = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inMask = mask[idx];
        const bit = inMask 
          ? hash2DBit(x, y, seed + textFrame)
          : hash2DBit(x, y, seed + bgFrame);

        buf[idx] = bit ? c1 : c0;
        idx++;
      }
    }

    this.pixelCtx.putImageData(this.imageData, 0, 0);

    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(this.pixelCanvas, 0, 0, W, H, 0, 0, targetW, targetH);

    if (this.params.showMask && targetCtx === this.ctx && this.textMask.canvas) {
      targetCtx.save();
      targetCtx.globalAlpha = 0.22;
      targetCtx.drawImage(this.textMask.canvas, 0, 0, this.width, this.height);
      targetCtx.strokeStyle = theme.accent;
      targetCtx.lineWidth = 2;
      targetCtx.strokeRect(0, 0, this.width, this.height);
      targetCtx.restore();
    }
  }

  render() {
    this.renderFrame(this.elapsedTime);
  }

  update(dt) {
    if (!this.params.isPlaying) return;
    this.elapsedTime += dt;
  }

  step(now) {
    if (!this.lastTimestamp) this.lastTimestamp = now;
    const dt = Math.min((now - this.lastTimestamp) / 1000, 0.1);
    this.lastTimestamp = now;

    if (dt > 0) {
      const instantFps = 1 / dt;
      this.fps = this.fps * (1 - this.fpsAlpha) + instantFps * this.fpsAlpha;
    }

    this.update(dt);
    this.render();

    requestAnimationFrame(this.step.bind(this));
  }

  stepSingleFrame() {
    this.update(1 / 60);
    this.render();
  }
}

// ==========================================
// 5. UI & Instant MP4 Video Exporter Controller
// ==========================================
class App {
  constructor() {
    this.canvas = document.getElementById('cipherCanvas');
    this.textMask = new TextMask();
    this.engine = new MotionEngine(this.canvas, this.textMask);

    this.isExporting = false;

    this.dom = {
      sentenceInput: document.getElementById('sentenceInput'),
      charCounter: document.getElementById('charCounter'),
      generateBtn: document.getElementById('generateBtn'),
      playPauseBtn: document.getElementById('playPauseBtn'),
      playPauseText: document.getElementById('playPauseText'),
      playIcon: document.getElementById('playIcon'),
      pauseIcon: document.getElementById('pauseIcon'),
      regenerateBtn: document.getElementById('regenerateBtn'),
      pixelSizeSlider: document.getElementById('pixelSizeSlider'),
      pixelSizeValue: document.getElementById('pixelSizeValue'),
      flickerSlider: document.getElementById('flickerSlider'),
      flickerValue: document.getElementById('flickerValue'),
      bgRateSlider: document.getElementById('bgRateSlider'),
      bgRateValue: document.getElementById('bgRateValue'),
      resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),
      themePicker: document.getElementById('themePicker'),
      stepFrameBtn: document.getElementById('stepFrameBtn'),
      toggleMaskBtn: document.getElementById('toggleMaskBtn'),
      maskBtnText: document.getElementById('maskBtnText'),
      snapshotBtn: document.getElementById('snapshotBtn'),
      downloadVideoBtn: document.getElementById('downloadVideoBtn'),
      downloadVideoText: document.getElementById('downloadVideoText'),
      videoIcon: document.getElementById('videoIcon'),
      motionStatusBadge: document.getElementById('motionStatusBadge'),
      motionStatusText: document.getElementById('motionStatusText'),
      fpsDisplay: document.getElementById('fpsDisplay'),
      outsidePausedBanner: document.getElementById('outsidePausedBanner'),
      totalParticlesCount: document.getElementById('totalParticlesCount'),
      maskCoveragePct: document.getElementById('maskCoveragePct'),
      activeFreqDisplay: document.getElementById('activeFreqDisplay'),
      presetChips: document.querySelectorAll('.chip'),
      infoBtn: document.getElementById('infoBtn'),
      infoModal: document.getElementById('infoModal'),
      modalCloseBtn: document.getElementById('modalCloseBtn'),
      modalGotItBtn: document.getElementById('modalGotItBtn'),
      snapshotModal: document.getElementById('snapshotModal'),
      snapshotCloseBtn: document.getElementById('snapshotCloseBtn'),
      snapshotOkBtn: document.getElementById('snapshotOkBtn'),
      snapshotImg: document.getElementById('snapshotImg'),
      downloadSnapshotLink: document.getElementById('downloadSnapshotLink')
    };
  }

  init() {
    this.engine.init();
    this.bindEvents();
    this.updateUI();

    requestAnimationFrame(this.engine.step.bind(this.engine));

    setInterval(() => {
      this.dom.fpsDisplay.querySelector('.fps-value').textContent = Math.round(this.engine.fps);
      const pixelCount = this.engine.pixelW * this.engine.pixelH;
      this.dom.totalParticlesCount.textContent = pixelCount.toLocaleString();
      this.dom.maskCoveragePct.textContent = `${this.textMask.coveragePct.toFixed(1)}%`;
      this.dom.activeFreqDisplay.textContent = `${this.engine.params.textRefreshRate} Hz`;
    }, 250);
  }

  bindEvents() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.engine.resize();
        this.updateUI();
      }, 100);
    });

    this.dom.sentenceInput.addEventListener('input', (e) => {
      const val = e.target.value;
      this.dom.charCounter.textContent = `${val.length}/100`;
    });

    this.dom.sentenceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.generateCipher();
      }
    });

    this.dom.generateBtn.addEventListener('click', () => {
      this.generateCipher();
    });

    this.dom.playPauseBtn.addEventListener('click', () => {
      this.togglePlayPause();
    });

    this.dom.regenerateBtn.addEventListener('click', () => {
      this.engine.reseed();
    });

    this.dom.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.dom.presetChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const text = chip.getAttribute('data-text');
        this.dom.sentenceInput.value = text;
        this.dom.charCounter.textContent = `${text.length}/100`;
        this.generateCipher();
      });
    });

    this.dom.pixelSizeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.engine.params.pixelSize = val;
      this.dom.pixelSizeValue.textContent = `${val} px`;
      this.engine.buildPixelBuffer();
    });

    this.dom.flickerSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.engine.params.textRefreshRate = val;
      this.dom.flickerValue.textContent = `${val} Hz`;
    });

    this.dom.bgRateSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.engine.params.bgRefreshRate = val;
      this.dom.bgRateValue.textContent = `${val} Hz`;
    });

    this.dom.resetDefaultsBtn.addEventListener('click', () => {
      this.resetDefaults();
    });

    const themeButtons = this.dom.themePicker.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        themeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.getAttribute('data-theme');
        this.engine.params.theme = theme;
      });
    });

    this.dom.stepFrameBtn.addEventListener('click', () => {
      if (this.engine.params.isPlaying) {
        this.togglePlayPause();
      }
      this.engine.stepSingleFrame();
    });

    this.dom.toggleMaskBtn.addEventListener('click', () => {
      this.toggleMaskOverlay();
    });

    this.dom.snapshotBtn.addEventListener('click', () => {
      this.captureSnapshot();
    });

    // Instant 10-Second MP4 Video Download Button
    this.dom.downloadVideoBtn.addEventListener('click', () => {
      this.export10SecondMP4Instant();
    });

    this.dom.infoBtn.addEventListener('click', () => {
      this.dom.infoModal.classList.add('open');
    });

    const closeInfo = () => this.dom.infoModal.classList.remove('open');
    this.dom.modalCloseBtn.addEventListener('click', closeInfo);
    this.dom.modalGotItBtn.addEventListener('click', closeInfo);

    const closeSnapshot = () => this.dom.snapshotModal.classList.remove('open');
    this.dom.snapshotCloseBtn.addEventListener('click', closeSnapshot);
    this.dom.snapshotOkBtn.addEventListener('click', closeSnapshot);

    window.addEventListener('keydown', (e) => {
      if (document.activeElement === this.dom.sentenceInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.engine.reseed();
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        this.toggleMaskOverlay();
      }
    });
  }

  generateCipher() {
    const text = this.dom.sentenceInput.value;
    this.engine.params.text = text;
    this.textMask.generate(text);
    this.engine.buildPixelBuffer();

    if (!this.engine.params.isPlaying) {
      this.togglePlayPause();
    }
  }

  togglePlayPause() {
    this.engine.params.isPlaying = !this.engine.params.isPlaying;
    const isPlaying = this.engine.params.isPlaying;

    if (isPlaying) {
      this.dom.playPauseText.textContent = 'Pause';
      this.dom.playIcon.classList.add('hidden');
      this.dom.pauseIcon.classList.remove('hidden');
      this.dom.motionStatusBadge.classList.remove('paused');
      this.dom.motionStatusText.textContent = 'PIXEL NOISE IN MOTION';
      this.dom.outsidePausedBanner.classList.add('hidden');
    } else {
      this.dom.playPauseText.textContent = 'Play';
      this.dom.playIcon.classList.remove('hidden');
      this.dom.pauseIcon.classList.add('hidden');
      this.dom.motionStatusBadge.classList.add('paused');
      this.dom.motionStatusText.textContent = 'MOTION PAUSED';
      this.dom.outsidePausedBanner.classList.remove('hidden');
    }
  }

  toggleMaskOverlay() {
    this.engine.params.showMask = !this.engine.params.showMask;
    const show = this.engine.params.showMask;
    this.dom.toggleMaskBtn.classList.toggle('active', show);
    this.dom.maskBtnText.textContent = show ? 'Hide Mask' : 'Reveal Mask';
  }

  captureSnapshot() {
    const dataUrl = this.canvas.toDataURL('image/png');
    this.dom.snapshotImg.src = dataUrl;
    this.dom.downloadSnapshotLink.href = dataUrl;
    this.dom.snapshotModal.classList.add('open');
  }

  /**
   * Instantly generate and automatically download a 10-second MP4 video on click (<0.3 seconds).
   * Uses hardware-accelerated H.264 VideoEncoder & Mp4Muxer.
   */
  async export10SecondMP4Instant() {
    if (this.isExporting) return;
    this.isExporting = true;

    const btn = this.dom.downloadVideoBtn;
    const label = this.dom.downloadVideoText;
    btn.classList.add('recording');
    label.textContent = 'Generating MP4...';

    const fps = 30;
    const durationSec = 10;
    const totalFrames = fps * durationSec;
    const dt = 1 / fps;

    // Fixed video dimensions (even dimensions required for H.264 video codec)
    const vidW = this.canvas.width - (this.canvas.width % 2);
    const vidH = this.canvas.height - (this.canvas.height % 2);

    try {
      if (window.VideoEncoder && window.Mp4Muxer) {
        // Fast Hardware-Accelerated H.264 MP4 Export
        const target = new Mp4Muxer.ArrayBufferTarget();
        const muxer = new Mp4Muxer.Muxer({
          target: target,
          video: {
            codec: 'avc',
            width: vidW,
            height: vidH
          },
          fastStart: 'in-memory'
        });

        let encoderError = null;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: (err) => {
            encoderError = err;
            console.error('H.264 VideoEncoder error:', err);
          }
        });

        encoder.configure({
          codec: 'avc1.42001f', // H.264 Baseline Profile level 3.1 (universal compatibility)
          width: vidW,
          height: vidH,
          bitrate: 4000000,     // 4 Mbps
          framerate: fps
        });

        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = vidW;
        renderCanvas.height = vidH;
        const renderCtx = renderCanvas.getContext('2d', { alpha: false });

        let simTime = this.engine.elapsedTime;

        // Render all 300 frames in an offscreen batch loop
        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
          this.engine.renderFrame(simTime, renderCtx, vidW, vidH);
          simTime += dt;

          const timestampMicros = frameIndex * (1000000 / fps);
          const videoFrame = new VideoFrame(renderCanvas, {
            timestamp: timestampMicros,
            duration: 1000000 / fps
          });

          encoder.encode(videoFrame, { keyFrame: (frameIndex % 30 === 0) });
          videoFrame.close();
        }

        await encoder.flush();
        encoder.close();

        if (encoderError) throw encoderError;

        muxer.finalize();
        const mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
        this.triggerDownloadMP4(mp4Blob);

      } else {
        throw new Error('WebCodecs or Mp4Muxer not available');
      }
    } catch (err) {
      console.error('Instant MP4 generation error:', err);
      alert('Could not generate MP4: ' + err.message);
    } finally {
      this.isExporting = false;
      btn.classList.remove('recording');
      label.textContent = 'Download 10s MP4';
    }
  }

  triggerDownloadMP4(blob) {
    const url = URL.createObjectURL(blob);
    const cleanName = (this.engine.params.text || 'ghost-writer').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `ghost-writer-${cleanName}-10s.mp4`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 2000);
  }

  resetDefaults() {
    this.engine.params.pixelSize = 2;
    this.engine.params.textRefreshRate = 60;
    this.engine.params.bgRefreshRate = 2;
    this.engine.params.theme = 'bw';

    this.dom.pixelSizeSlider.value = 2;
    this.dom.pixelSizeValue.textContent = '2 px';
    this.dom.flickerSlider.value = 60;
    this.dom.flickerValue.textContent = '60 Hz';
    this.dom.bgRateSlider.value = 2;
    this.dom.bgRateValue.textContent = '2 Hz';

    const themeButtons = this.dom.themePicker.querySelectorAll('.theme-btn');
    themeButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.theme-btn[data-theme="bw"]').classList.add('active');

    this.engine.buildPixelBuffer();
  }

  updateUI() {
    const text = this.dom.sentenceInput.value;
    this.dom.charCounter.textContent = `${text.length}/100`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
