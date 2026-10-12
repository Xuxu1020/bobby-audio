document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tabBtnUrl = document.getElementById('tabBtnUrl');
  const tabBtnFile = document.getElementById('tabBtnFile');
  const panelUrl = document.getElementById('panelUrl');
  const panelFile = document.getElementById('panelFile');

  const urlInput = document.getElementById('urlInput');
  const btnPaste = document.getElementById('btnPaste');
  const videoPreview = document.getElementById('videoPreview');
  const previewThumbnail = document.getElementById('previewThumbnail');
  const previewTitle = document.getElementById('previewTitle');
  const previewAuthor = document.getElementById('previewAuthor');
  const previewDuration = document.getElementById('previewDuration');

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowse = document.getElementById('btnBrowse');
  const dropEmptyState = document.getElementById('dropEmptyState');
  const fileSelectedState = document.getElementById('fileSelectedState');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');
  const btnRemoveFile = document.getElementById('btnRemoveFile');

  const bitrateChips = document.querySelectorAll('.bitrate-chip');
  const btnConvert = document.getElementById('btnConvert');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnIconWrapper = document.getElementById('btnIconWrapper');
  const btnText = document.getElementById('btnText');

  const statusSection = document.getElementById('statusSection');
  const statusLabel = document.getElementById('statusLabel');
  const statusPercent = document.getElementById('statusPercent');
  const progressBar = document.getElementById('progressBar');

  const resultCard = document.getElementById('resultCard');
  const resultFileName = document.getElementById('resultFileName');
  const resultFileSize = document.getElementById('resultFileSize');
  const btnDownload = document.getElementById('btnDownload');
  const btnReset = document.getElementById('btnReset');
  const toast = document.getElementById('toast');

  let currentMode = 'url'; // 'url' | 'file'
  let selectedFile = null;
  let debounceTimer = null;
  let progressInterval = null;

  // 1. Tab Switching
  function switchTab(mode) {
    currentMode = mode;
    hideResult();
    
    if (mode === 'url') {
      tabBtnUrl.classList.add('active');
      tabBtnUrl.setAttribute('aria-selected', 'true');
      tabBtnFile.classList.remove('active');
      tabBtnFile.setAttribute('aria-selected', 'false');

      panelUrl.classList.remove('hidden');
      panelFile.classList.add('hidden');
      btnText.textContent = 'Convert URL to MP3';
    } else {
      tabBtnFile.classList.add('active');
      tabBtnFile.setAttribute('aria-selected', 'true');
      tabBtnUrl.classList.remove('active');
      tabBtnUrl.setAttribute('aria-selected', 'false');

      panelFile.classList.remove('hidden');
      panelUrl.classList.add('hidden');
      btnText.textContent = 'Extract MP4 to MP3';
    }
  }

  tabBtnUrl.addEventListener('click', () => switchTab('url'));
  tabBtnFile.addEventListener('click', () => switchTab('file'));

  // 2. Bitrate Radio Styling
  bitrateChips.forEach(chip => {
    chip.addEventListener('click', () => {
      bitrateChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const radio = chip.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  function getSelectedBitrate() {
    const checked = document.querySelector('input[name="bitrate"]:checked');
    return checked ? checked.value : '192k';
  }

  // 3. Format Helpers
  function formatSeconds(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.className = `toast toast-${type}`;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  // 4. URL Paste and Fetch Info
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        triggerFetchInfo(urlInput.value);
      }
    } catch (e) {
      showToast('Clipboard access denied. Please paste manually.', 'error');
    }
  });

  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    if (val.startsWith('http://') || val.startsWith('https://')) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => triggerFetchInfo(val), 600);
    } else {
      videoPreview.classList.add('hidden');
    }
  });

  async function triggerFetchInfo(url) {
    if (!url || !url.startsWith('http')) return;
    try {
      videoPreview.classList.remove('hidden');
      previewTitle.textContent = 'Fetching media preview...';
      previewAuthor.textContent = '...';
      previewDuration.textContent = '...';
      previewThumbnail.src = '';
      previewThumbnail.style.opacity = '0.3';

      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        videoPreview.classList.add('hidden');
        return;
      }

      const data = await res.json();
      previewTitle.textContent = data.title || 'Audio Stream';
      previewAuthor.textContent = data.uploader || 'Creator';
      previewDuration.textContent = formatSeconds(data.duration);
      if (data.thumbnail) {
        previewThumbnail.src = data.thumbnail;
        previewThumbnail.style.opacity = '1';
      } else {
        previewThumbnail.src = '';
      }
      videoPreview.classList.remove('hidden');
    } catch (err) {
      videoPreview.classList.add('hidden');
    }
  }

  // 5. File Drag & Drop Handlers
  btnBrowse.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => {
    if (!selectedFile) fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  function handleFileSelected(file) {
    selectedFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatBytes(file.size);

    dropEmptyState.classList.add('hidden');
    fileSelectedState.classList.remove('hidden');
    hideResult();
  }

  btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    dropEmptyState.classList.remove('hidden');
    fileSelectedState.classList.add('hidden');
    hideResult();
  });

  // 6. Conversion Progress Simulator
  function startProgressAnimation(messages) {
    statusSection.classList.remove('hidden');
    let currentStep = 0;
    let percent = 15;

    statusLabel.textContent = messages[0];
    statusPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;

    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      if (percent < 90) {
        percent += Math.floor(Math.random() * 8) + 4;
        if (percent > 90) percent = 90;
        progressBar.style.width = `${percent}%`;
        statusPercent.textContent = `${percent}%`;

        if (percent > 45 && currentStep === 0 && messages[1]) {
          currentStep = 1;
          statusLabel.textContent = messages[1];
        } else if (percent > 70 && currentStep <= 1 && messages[2]) {
          currentStep = 2;
          statusLabel.textContent = messages[2];
        }
      }
    }, 700);
  }

  function finishProgress() {
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    statusPercent.textContent = '100%';
    statusLabel.textContent = 'Finishing MP3 encoding...';
    setTimeout(() => {
      statusSection.classList.add('hidden');
    }, 600);
  }

  function stopProgress() {
    clearInterval(progressInterval);
    statusSection.classList.add('hidden');
  }

  function setLoading(loading) {
    if (loading) {
      btnConvert.disabled = true;
      btnSpinner.classList.remove('hidden');
      btnIconWrapper.classList.add('hidden');
    } else {
      btnConvert.disabled = false;
      btnSpinner.classList.add('hidden');
      btnIconWrapper.classList.remove('hidden');
    }
  }

  function hideResult() {
    resultCard.classList.add('hidden');
    statusSection.classList.add('hidden');
  }

  function showResult(downloadId, filename, fileSize) {
    resultFileName.textContent = filename;
    resultFileSize.textContent = `${formatBytes(fileSize)} • High Quality MP3`;
    btnDownload.href = `/api/download/${downloadId}`;
    btnDownload.setAttribute('download', filename);
    resultCard.classList.remove('hidden');
  }

  // 7. Convert Trigger
  btnConvert.addEventListener('click', async () => {
    hideResult();
    const bitrate = getSelectedBitrate();

    if (currentMode === 'url') {
      const url = urlInput.value.trim();
      if (!url) {
        showToast('Please enter a video or media URL first.', 'error');
        urlInput.focus();
        return;
      }

      setLoading(true);
      startProgressAnimation([
        'Connecting & downloading media stream...',
        'Extracting audio with FFmpeg...',
        'Encoding 320kbps MP3 tags...'
      ]);

      try {
        const response = await fetch('/api/convert-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, bitrate })
        });

        const data = await response.json();
        finishProgress();

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Conversion failed');
        }

        showResult(data.downloadId, data.filename, data.fileSize);
        showToast('URL converted successfully! Click Download.', 'success');
      } catch (err) {
        stopProgress();
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }

    } else {
      // Local MP4 upload mode
      if (!selectedFile) {
        showToast('Please select or drop an MP4 video file.', 'error');
        return;
      }

      setLoading(true);
      startProgressAnimation([
        'Uploading video file...',
        'Extracting audio stream with FFmpeg...',
        'Encoding output MP3 file...'
      ]);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('bitrate', bitrate);

      try {
        const response = await fetch('/api/convert-file', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        finishProgress();

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Conversion failed');
        }

        showResult(data.downloadId, data.filename, data.fileSize);
        showToast('MP4 converted successfully! Click Download.', 'success');
      } catch (err) {
        stopProgress();
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
  });

  // 8. Reset / Convert Another
  btnReset.addEventListener('click', () => {
    hideResult();
    if (currentMode === 'url') {
      urlInput.value = '';
      videoPreview.classList.add('hidden');
      urlInput.focus();
    } else {
      selectedFile = null;
      fileInput.value = '';
      dropEmptyState.classList.remove('hidden');
      fileSelectedState.classList.add('hidden');
    }
  });
});
