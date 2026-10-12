# Bobby the Converter - URL & Video to MP3 / MP4

A fast, modern web application to download and convert **Instagram Reels, YouTube, TikTok, SoundCloud** or **local MP4 files** into **MP3 Audio** or **MP4 Video** using bundled FFmpeg.

---

## ✨ Features

- **Multi-Format Extraction**:
  - **From URL**: Download as **MP3 Audio** or high-def **MP4 Video** from Instagram Reels, YouTube, TikTok, and SoundCloud.
  - **From Local Files**: Drag & drop or browse your local video files (MP4, MKV, MOV, WebM) to strip video and extract MP3 audio.
- **Quality Selector**: Choose between **128 kbps** (Compact), **192 kbps** (Recommended), and **320 kbps** (Studio Quality).
- **Self-Contained**: Automatically uses bundled Windows `ffmpeg.exe` and `yt-dlp` — **no external software installation required**.
- **Privacy & Storage Friendly**: Automatically cleans temporary files after download.
- **Sleek UI**: Modern translucent dark-mode interface with live preview, real-time conversion status, and direct download links.

---

## How to Run

### 1. Start the Server
Open PowerShell in this folder (`c:\Users\Jian Heng\Desktop\Projects\URLtoMP3Converter`) and run:
```bash
npm start
```

### 2. Open in Your Browser
Visit:
```
http://localhost:3000
```

---

## How to Use

### Mode A: Convert from URL
1. Click the **"Convert from URL"** tab.
2. Paste any supported video/media URL (e.g. YouTube, SoundCloud, Vimeo) into the input box (or click **"Paste"**).
3. Select your desired bitrate (**192 kbps** or **320 kbps**).
4. Click **"Convert to MP3"**.
5. Once conversion is complete, click **"Download MP3"**.

### Mode B: Convert from Local MP4 File
1. Click the **"Upload MP4 File"** tab.
2. Drag and drop your `.mp4` video file into the dashed box (or click to browse your computer).
3. Select your desired bitrate.
4. Click **"Extract MP4 to MP3"**.
5. Click **"Download MP3"** to save your new audio file.

---

## Project Structure

- `server.js` - Express backend API handling file uploads (`multer`), stream extraction (`yt-dlp`), and audio encoding (`fluent-ffmpeg`).
- `public/index.html` - Web application structure.
- `public/style.css` - Custom styling and dark-mode aesthetics.
- `public/app.js` - Client-side state, drag-and-drop, and API requests.
- `temp/` - Staging directory for ongoing conversions (auto-cleans every 15-30 minutes).
