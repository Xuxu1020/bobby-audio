const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('crypto').randomUUID ? { v4: require('crypto').randomUUID } : { v4: () => Math.random().toString(36).substring(2) + Date.now().toString(36) };

// ── Logging setup ─────────────────────────────────────────────────────────────
const LOGS_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'url_log.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bobby123';

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '[]', 'utf8');

function readLogs() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); }
  catch { return []; }
}

function appendLog(entry) {
  const logs = readLogs();
  logs.unshift(entry); // newest first
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
// ──────────────────────────────────────────────────────────────────────────────

// Configure fluent-ffmpeg to use static binary or system ffmpeg
const ffmpegBinary = (ffmpegStatic && fs.existsSync(ffmpegStatic)) ? ffmpegStatic : 'ffmpeg';
ffmpeg.setFfmpegPath(ffmpegBinary);

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure temp and uploads directories exist
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// In-memory registry for download tasks
// id -> { filePath, filename, createdAt }
const downloadRegistry = new Map();

// Helper to sanitize filenames for OS compatibility
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 180) || 'audio';
}

// Clean up stale files older than 30 minutes
function cleanOldFiles() {
  const now = Date.now();
  const MAX_AGE = 30 * 60 * 1000; // 30 mins

  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      fs.stat(filePath, (err, stat) => {
        if (!err && now - stat.mtimeMs > MAX_AGE) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });

  // Clean registry
  for (const [id, data] of downloadRegistry.entries()) {
    if (now - data.createdAt > MAX_AGE) {
      downloadRegistry.delete(id);
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanOldFiles, 15 * 60 * 1000);
cleanOldFiles();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for MP4 uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    cb(null, `upload_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.mp4', '.m4v', '.mov', '.avi', '.mkv', '.webm', '.flv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files (MP4, MKV, MOV, WebM, etc.) are allowed'));
    }
  }
});

// 1. Fetch metadata preview for URL
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  const logEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ip: getClientIp(req),
    url: url.trim(),
    action: 'info_fetch',
    format: null,
    status: 'pending',
    error: null,
  };

  try {
    const output = await youtubedl(url.trim(), {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
    });

    const info = {
      title: output.title || 'Unknown Title',
      duration: output.duration || 0,
      uploader: output.uploader || output.channel || 'Unknown Creator',
      thumbnail: output.thumbnail || null,
      webpage_url: output.webpage_url || url,
    };

    logEntry.status = 'success';
    appendLog(logEntry);
    return res.json(info);
  } catch (err) {
    console.error('Info extraction error:', err.message);
    logEntry.status = 'error';
    logEntry.error = err.message;
    appendLog(logEntry);
    return res.status(400).json({
      error: 'Unable to fetch media info. Ensure the URL is public and valid.',
      details: err.message
    });
  }
});

// 2. Convert from URL to MP3 or MP4 (Instagram Reels, YouTube, TikTok, etc.)
app.post('/api/convert-url', async (req, res) => {
  const { url, format = 'mp3', bitrate = '192k' } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  const isMp4 = format.toLowerCase() === 'mp4';
  const validBitrates = ['128k', '192k', '256k', '320k'];
  const selectedBitrate = validBitrates.includes(bitrate) ? bitrate : '192k';

  const logEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ip: getClientIp(req),
    url: url.trim(),
    action: 'convert',
    format: isMp4 ? 'mp4' : 'mp3',
    bitrate: isMp4 ? null : selectedBitrate,
    status: 'pending',
    error: null,
  };

  try {
    const downloadId = uuidv4();
    const outputTemplate = path.join(TEMP_DIR, `${downloadId}_%(title)s.%(ext)s`);

    if (isMp4) {
      console.log(`[URL] Downloading video (MP4) for: ${url}`);
      await youtubedl(url.trim(), {
        format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        mergeOutputFormat: 'mp4',
        ffmpegLocation: ffmpegBinary,
        output: outputTemplate,
        noPlaylist: true,
      });
    } else {
      console.log(`[URL] Downloading audio (MP3) for: ${url} (Bitrate: ${selectedBitrate})`);
      await youtubedl(url.trim(), {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: selectedBitrate.replace('k', ''),
        ffmpegLocation: ffmpegBinary,
        output: outputTemplate,
        noPlaylist: true,
        addMetadata: true,
      });
    }

    // Find the generated file in TEMP_DIR matching downloadId
    const targetExt = isMp4 ? '.mp4' : '.mp3';
    const files = fs.readdirSync(TEMP_DIR);
    const convertedFile = files.find(f => f.startsWith(`${downloadId}_`) && f.endsWith(targetExt));

    if (!convertedFile) {
      throw new Error(`Converted ${isMp4 ? 'MP4' : 'MP3'} file was not found.`);
    }

    const fullPath = path.join(TEMP_DIR, convertedFile);
    // Extract clean display name by stripping downloadId prefix
    const displayName = convertedFile.replace(`${downloadId}_`, '');

    downloadRegistry.set(downloadId, {
      filePath: fullPath,
      filename: displayName,
      createdAt: Date.now()
    });

    const stats = fs.statSync(fullPath);

    logEntry.status = 'success';
    appendLog(logEntry);

    return res.json({
      downloadId,
      filename: displayName,
      fileSize: stats.size,
      format: isMp4 ? 'mp4' : 'mp3',
      message: `${isMp4 ? 'MP4 video' : 'MP3 audio'} extracted successfully`
    });
  } catch (err) {
    console.error('[URL] Conversion error:', err);
    logEntry.status = 'error';
    logEntry.error = err.message;
    appendLog(logEntry);
    return res.status(500).json({
      error: `Failed to extract ${isMp4 ? 'MP4 video' : 'MP3 audio'} from URL.`,
      details: err.message
    });
  }
});

// 3. Convert uploaded MP4 to MP3
app.post('/api/convert-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a video file (.mp4, etc.)' });
  }

  const bitrate = req.body.bitrate || '192k';
  const validBitrates = ['128k', '192k', '256k', '320k'];
  const selectedBitrate = validBitrates.includes(bitrate) ? bitrate : '192k';

  const downloadId = uuidv4();
  const originalBaseName = path.parse(req.file.originalname).name;
  const safeBaseName = sanitizeFilename(originalBaseName);
  const outFilename = `${safeBaseName}.mp3`;
  const outFilePath = path.join(TEMP_DIR, `${downloadId}_${outFilename}`);

  console.log(`[File] Converting uploaded file: ${req.file.originalname} -> ${outFilename}`);

  ffmpeg(req.file.path)
    .noVideo()
    .audioCodec('libmp3lame')
    .audioBitrate(selectedBitrate)
    .output(outFilePath)
    .on('end', () => {
      // Remove original uploaded input video file to free disk space
      fs.unlink(req.file.path, () => {});

      const stats = fs.statSync(outFilePath);
      downloadRegistry.set(downloadId, {
        filePath: outFilePath,
        filename: outFilename,
        createdAt: Date.now()
      });

      return res.json({
        downloadId,
        filename: outFilename,
        fileSize: stats.size,
        message: 'Conversion completed successfully'
      });
    })
    .on('error', (err) => {
      console.error('[File] Transcoding error:', err);
      // Clean up uploaded file
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({
        error: 'Failed to transcode MP4 to MP3.',
        details: err.message
      });
    })
    .run();
});

// 4. Download converted MP3
app.get('/api/download/:id', (req, res) => {
  const { id } = req.params;
  const item = downloadRegistry.get(id);

  if (!item || !fs.existsSync(item.filePath)) {
    return res.status(404).send('File not found or has expired. Please convert again.');
  }

  const isVideo = item.filename.toLowerCase().endsWith('.mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
  res.setHeader('Content-Type', isVideo ? 'video/mp4' : 'audio/mpeg');

  const stream = fs.createReadStream(item.filePath);
  stream.pipe(res);

  stream.on('end', () => {
    // Optionally schedule delete after serving
    setTimeout(() => {
      fs.unlink(item.filePath, () => {});
      downloadRegistry.delete(id);
    }, 60000); // 1 minute after download
  });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// Middleware: verify admin password from header or query param
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-password'] || req.query.password;
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized. Wrong admin password.' });
  }
  next();
}

// GET /api/admin/logs — return all log entries
app.get('/api/admin/logs', requireAdmin, (req, res) => {
  res.json(readLogs());
});

// DELETE /api/admin/logs — clear all logs
app.delete('/api/admin/logs', requireAdmin, (req, res) => {
  fs.writeFileSync(LOG_FILE, '[]', 'utf8');
  res.json({ message: 'Logs cleared.' });
});

// Serve the admin page (password gate handled client-side)
app.get('/whyareyouhere', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
// ──────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 URL & MP4 to MP3 Converter Server running!`);
  console.log(`🌐 Local Web UI: http://localhost:${PORT}`);
  console.log(`🎵 Ready to convert URLs & local MP4 files to MP3`);
  console.log(`🔐 Admin panel:  http://localhost:${PORT}/whyareyouhere`);
  console.log(`=================================================\n`);
});
