const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('crypto').randomUUID ? { v4: require('crypto').randomUUID } : { v4: () => Math.random().toString(36).substring(2) + Date.now().toString(36) };

// Configure fluent-ffmpeg to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

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

    return res.json(info);
  } catch (err) {
    console.error('Info extraction error:', err.message);
    return res.status(400).json({
      error: 'Unable to fetch media info. Ensure the URL is public and valid.',
      details: err.message
    });
  }
});

// 2. Convert from URL to MP3
app.post('/api/convert-url', async (req, res) => {
  const { url, bitrate = '192k' } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  const validBitrates = ['128k', '192k', '256k', '320k'];
  const selectedBitrate = validBitrates.includes(bitrate) ? bitrate : '192k';

  try {
    const downloadId = uuidv4();
    const outputTemplate = path.join(TEMP_DIR, `${downloadId}_%(title)s.%(ext)s`);

    console.log(`[URL] Starting download for: ${url} (Bitrate: ${selectedBitrate})`);

    // Fetch video title first or extract directly
    await youtubedl(url.trim(), {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: selectedBitrate.replace('k', ''),
      ffmpegLocation: ffmpegStatic,
      output: outputTemplate,
      noPlaylist: true,
      addMetadata: true,
    });

    // Find the generated file in TEMP_DIR matching downloadId
    const files = fs.readdirSync(TEMP_DIR);
    const convertedFile = files.find(f => f.startsWith(`${downloadId}_`) && f.endsWith('.mp3'));

    if (!convertedFile) {
      throw new Error('Converted MP3 file was not found.');
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

    return res.json({
      downloadId,
      filename: displayName,
      fileSize: stats.size,
      message: 'Conversion completed successfully'
    });
  } catch (err) {
    console.error('[URL] Conversion error:', err);
    return res.status(500).json({
      error: 'Failed to convert URL to MP3.',
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

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
  res.setHeader('Content-Type', 'audio/mpeg');

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

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 URL & MP4 to MP3 Converter Server running!`);
  console.log(`🌐 Local Web UI: http://localhost:${PORT}`);
  console.log(`🎵 Ready to convert URLs & local MP4 files to MP3`);
  console.log(`=================================================\n`);
});
