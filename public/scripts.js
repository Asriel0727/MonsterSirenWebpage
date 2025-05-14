// 全局變量
let audioPlayer = null;
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentSongIndex = 0;
let currentAlbumSongs = [];
let lyrics = [];
let isPlaying = false;
let isUserScrolled = false;
let scrollTimeout;
let allSongs = [];
let currentGlobalSong = null;
let allSongsBarLoaded = false;
let allSongsForBar = [];

// ====== 音波動畫區塊與 Web Audio API 相關程式碼已移除 ======

// DOM 元素
const albumsContainer = document.getElementById('albums');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const loadingSpinner = document.getElementById('loading');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// ====== Now Playing Dropdown 功能 ======
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingDropdownBtn = document.getElementById('now-playing-dropdown-btn');
const nowPlayingDropdownList = document.getElementById('now-playing-dropdown-list');

let nowPlayingSongList = [];
let nowPlayingSongIndex = 0;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    audioPlayer = document.getElementById('audio-player');
    fetchAlbums();
    setupEventListeners();
    const toggleBtn = document.getElementById('toggle-all-songs-btn');
    const listDiv = document.getElementById('all-songs-list');
    if (toggleBtn && listDiv) {
        toggleBtn.addEventListener('click', async () => {
            if (listDiv.style.display === 'none') {
                listDiv.style.display = 'block';
                toggleBtn.innerHTML = '所有歌曲 ▲';
                if (!allSongsBarLoaded) {
                    await loadAllSongsForBar();
                    allSongsBarLoaded = true;
                }
            } else {
                listDiv.style.display = 'none';
                toggleBtn.innerHTML = '所有歌曲 ▼';
            }
        });
    }
});

// 設置事件監聽器
function setupEventListeners() {
    window.addEventListener('scroll', handleScroll);
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
}

// 加載專輯
async function fetchAlbums(page = 1, searchQuery = '') {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    showLoading();
    
    try {
        let url = "https://monstersiren-web-api.vercel.app/api/albums";
        if (searchQuery) {
            url += `?search=${encodeURIComponent(searchQuery)}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const { data: albums } = await response.json();
        
        if (page === 1) {
            albumsContainer.innerHTML = '';
            currentPage = 1;
        }
        
        if (albums.length === 0) {
            hasMore = false;
            if (page === 1) {
                albumsContainer.innerHTML = '<p class="no-results">沒有找到相關專輯</p>';
            }
        } else {
            renderAlbums(albums);
            currentPage++;
        }
    } catch (error) {
        console.error('Error fetching albums:', error);
        showError('加載專輯失敗，請稍後重試');
    } finally {
        isLoading = false;
        hideLoading();
    }
}

// 渲染專輯列表
function renderAlbums(albums) {
    albums.forEach(album => {
        const albumDiv = document.createElement('div');
        albumDiv.className = 'album';
        albumDiv.innerHTML = `
            <img loading="lazy" 
                 src="https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(album.coverUrl)}" 
                 alt="${album.name}" 
                 onload="this.classList.add('loaded')">
            <div class="marquee-container">
                <div class="marquee-content">${album.name}</div>
            </div>
            <p>${album.artistes.join(', ')}</p>
            <button onclick="fetchAlbumDetails('${album.cid}')">查看專輯</button>
        `;
        
        // 檢查是否需要跑馬燈效果
        const marqueeContent = albumDiv.querySelector('.marquee-content');
        const container = albumDiv.querySelector('.marquee-container');
        
        // 使用 setTimeout 確保 DOM 已完全渲染
        setTimeout(() => {
            // 檢查內容是否超出容器寬度
            if (marqueeContent.scrollWidth > container.clientWidth) {
                container.style.overflow = 'hidden';
                marqueeContent.style.animation = 'marquee 10s linear infinite';
            } else {
                // 如果內容沒有超出，移除跑馬燈相關樣式
                container.style.overflow = 'visible';
                marqueeContent.style.animation = 'none';
                marqueeContent.style.paddingLeft = '0';
            }
        }, 0);
        
        albumsContainer.appendChild(albumDiv);
    });
}

// 滾動加載
function handleScroll() {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 100 && !isLoading && hasMore) {
        fetchAlbums(currentPage);
    }
}

// 搜索處理
function handleSearch() {
    const query = searchInput.value.trim();
    hasMore = true;
    fetchAlbums(1, query);
}

// 獲取專輯詳情
async function fetchAlbumDetails(albumId) {
    showLoading();
    
    try {
        const response = await fetch(`https://monstersiren-web-api.vercel.app/api/album/${albumId}/detail`);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const { data: album } = await response.json();
        
        // 初始化專輯歌曲數據
        currentAlbumSongs = album.songs.map(song => ({
            ...song,
            artistes: song.artistes || album.artistes || ['未知演出者'],
            coverUrl: album.coverUrl,
            coverDeUrl: album.coverDeUrl,
            duration: null // 初始化時長為 null
        }));

        // 先渲染專輯詳情
        renderAlbumDetails(album);
        
        // 獲取所有歌曲的時長
        await loadSongsDuration(currentAlbumSongs);
        
    } catch (error) {
        console.error('Error fetching album details:', error);
        showError('加載專輯詳情失敗，請稍後重試');
    } finally {
        hideLoading();
    }
}

// 加載歌曲時長
async function loadSongsDuration(songs) {
    // 使用 Promise.all 並行加載所有歌曲時長
    const durationPromises = songs.map(async (song) => {
        try {
            const tempAudio = new Audio(song.sourceUrl);
            
            // 創建一個 Promise 來處理音頻加載
            const duration = await new Promise((resolve, reject) => {
                tempAudio.addEventListener('loadedmetadata', () => {
                    resolve(tempAudio.duration);
                });
                
                tempAudio.addEventListener('error', () => {
                    reject(new Error(`無法加載歌曲 ${song.name} 的時長`));
                });
                
                // 設置超時
                setTimeout(() => {
                    reject(new Error(`加載歌曲 ${song.name} 的時長超時`));
                }, 10000);
            });
            
            // 更新歌曲時長
            song.duration = duration;
            // 更新顯示
            updateSongDuration(song.cid, duration);
            

            
        } catch (error) {
            console.warn(`無法獲取歌曲 ${song.name} 的時長:`, error);
            // 更新顯示為錯誤狀態
            updateSongDuration(song.cid, null, true);
        }
    });
    
    // 等待所有時長加載完成
    await Promise.all(durationPromises);
}

// 更新歌曲時長顯示
function updateSongDuration(songId, duration, isError = false) {
    const songItem = document.querySelector(`.song-item[data-song-id="${songId}"]`);
    if (songItem) {
        const durationElement = songItem.querySelector('.song-duration');
        if (durationElement) {
            if (isError) {
                durationElement.textContent = '--:--';
                durationElement.classList.add('error');
            } else {
                durationElement.textContent = formatDuration(duration);
                durationElement.classList.remove('error');
            }
        }
    }
}

// 渲染專輯詳情
function renderAlbumDetails(album) {
    modalBody.innerHTML = `
        <div class="album-details">
            <div class="album-details-header">
                <div class="album-cover">
                    <img src="https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(album.coverUrl)}" 
                         alt="${album.name}">
                </div>
                <div class="album-info">
                    <h2>${album.name}</h2>
                    <h3>${album.belong}</h3>
                    <p>${album.intro || '暫無介紹'}</p>
                </div>
            </div>
            
            <div class="song-list">
                <h3>曲目列表</h3>
                ${album.songs.map((song, index) => `
                    <div class="song-item">
                        <div class="song-number">${index + 1}</div>
                        <div class="song-title">${song.name}</div>
                        <div class="song-artist">${song.artistes.join(', ')}</div>
                        <div class="song-action">
                            <button onclick="playSongFromAlbum(${index}, '${album.coverUrl}', '${album.coverDeUrl}')">
                                播放
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    showModal();
}

// 從專輯播放歌曲
async function playSongFromAlbum(index, coverUrl, coverDeUrl) {
    syncNowPlaying(currentAlbumSongs, index);
    currentSongIndex = index;
    const song = currentAlbumSongs[index];
    await fetchSongDetails(song.cid, coverUrl, coverDeUrl);
}

// 獲取歌曲詳情
async function fetchSongDetails(songId, coverUrl, coverDeUrl) {
    showLoading();
    
    try {
        const response = await fetch(`https://monstersiren-web-api.vercel.app/api/song/${songId}`);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const { data: apiSong } = await response.json();
        const rawSong = currentAlbumSongs.find(s => s.cid === songId);
        
        const song = {
            ...apiSong,
            artistes: rawSong?.artistes || ['未知演出者'],
            coverUrl: rawSong?.coverUrl || coverUrl,
            coverDeUrl: rawSong?.coverDeUrl || coverDeUrl,
            audioUrl: apiSong.sourceUrl || '',
            duration: apiSong.duration || 0  // 確保有 duration 屬性
        };
        
        // 獲取歌詞
        let lyricsContent = '<p class="no-lyrics">暫無歌詞</p>';
        if (song.lyricUrl) {
            if (song.lyricUrl && typeof song.lyricUrl === 'string') {
                try {
                    lyrics = await fetchLyrics(song.lyricUrl);
                } catch (e) {
                    console.warn('歌詞加載失敗:', e);
                }
            }
            if (lyrics.length > 0) {
                lyricsContent = `
                    <div class="lyrics-container">
                        ${lyrics.map(line => `
                            <div class="lyrics-line" data-time="${line.time}">
                                ${line.text}
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }
        
        renderSongDetails(song, coverUrl, coverDeUrl, lyricsContent);
    } catch (error) {
        console.error('Error fetching song details:', error);
        showError('加載歌曲詳情失敗，請稍後重試');
    } finally {
        hideLoading();
    }
}

// 渲染歌曲詳情
function renderSongDetails(song, coverUrl, coverDeUrl, lyricsContent) {
    modalBody.innerHTML = `
        <div class="player-container">
            <div class="player-header">
                <div class="player-cover">
                    <img src="https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(coverUrl)}" 
                         alt="${song.name}">
                </div>
                <div class="player-info">
                    <h4>${song.name}</h4>
                    <p>${song.artistes.join(', ')}</p>
                </div>
            </div>
            <div class="player-controls">
                <div class="controls-top">
                    <button class="control-btn" id="prev-btn" onclick="playPreviousSong()">
                        <i class="fas fa-step-backward"></i>
                    </button>
                    <button class="control-btn play-pause" id="play-pause-btn" onclick="togglePlay()">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="control-btn" id="next-btn" onclick="playNextSong()">
                        <i class="fas fa-step-forward"></i>
                    </button>
                </div>
                <div class="progress-container" onclick="seek(event)">
                    <div class="progress-bar" id="progress-bar"></div>
                </div>
                <div class="progress-time">
                    <span id="current-time">00:00</span>
                    <span id="duration">00:00</span>
                </div>
                <div class="controls-bottom">
                    <div class="volume-control">
                        <button class="control-btn" id="mute-btn" onclick="toggleMute()">
                            <i class="fas fa-volume-up"></i>
                        </button>
                        <input type="range" id="volume-slider" min="0" max="1" step="0.1" value="1" 
                               oninput="setVolume(this.value)">
                    </div>
                </div>
            </div>
            ${lyricsContent}
        </div>
    `;
    // 只需同步 UI，不再建立 audio
    syncPlayerUI(song);
    showModal();
    setupLyricsScrollListener();
}

// 設置音頻播放器
function setupAudioPlayer() {
    if (!audioPlayer) return;
    // 釋放舊的 sourceNode
    if (sourceNode) {
        try { sourceNode.disconnect(); } catch(e){}
        sourceNode = null;
    }
    // 只建立一個 sourceNode 並連結
    if (audioContext) {
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 32;
        }
        sourceNode = audioContext.createMediaElementSource(audioPlayer);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
    }
    // 每次播放時 resume AudioContext
    audioPlayer.addEventListener('play', () => {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    });
    
    // 加載元數據
    audioPlayer.addEventListener('loadedmetadata', () => {
        // 設置總時長
        const duration = audioPlayer.duration;
        durationEl.textContent = formatTime(duration);
        
        // 更新當前專輯中的歌曲時長
        if (currentAlbumSongs[currentSongIndex]) {
            currentAlbumSongs[currentSongIndex].duration = duration;
        }
    });
    
    // 更新進度條
    audioPlayer.addEventListener('timeupdate', () => {
        const currentTime = audioPlayer.currentTime;
        const duration = audioPlayer.duration;
        
        if (duration) {
            const progressPercent = (currentTime / duration) * 100;
            progressBar.style.width = `${progressPercent}%`;
            currentTimeEl.textContent = formatTime(currentTime);
            
            // 同步歌詞
            syncLyrics(currentTime);
        }
    });
    
    // 播放結束
    audioPlayer.addEventListener('ended', () => {
        playNextSong();
    });
    
    // 播放狀態變化
    audioPlayer.addEventListener('play', () => {
        isPlaying = true;
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if (playerCover) playerCover.classList.add('playing');
    });
    
    audioPlayer.addEventListener('pause', () => {
        isPlaying = false;
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (playerCover) playerCover.classList.remove('playing');
    });
    
    // 音量控制
    volumeSlider.addEventListener('input', () => {
        audioPlayer.volume = volumeSlider.value;
        if (audioPlayer.volume > 0) {
            muteBtn.innerHTML = audioPlayer.volume > 0.5 ? 
                '<i class="fas fa-volume-up"></i>' : 
                '<i class="fas fa-volume-down"></i>';
        }
    });
    
    // 嘗試自動播放
    setTimeout(() => {
        audioPlayer.play().catch(e => {
            console.log('Autoplay prevented:', e);
            // 顯示播放按鈕讓用戶手動點擊
        });
    }, 500);
}

// 播放/暫停
function togglePlay() {
    if (!audioPlayer) return;
    
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

// 播放上一首
function playPreviousSong() {
    if (currentAlbumSongs.length === 0) return;
    
    currentSongIndex = (currentSongIndex - 1 + currentAlbumSongs.length) % currentAlbumSongs.length;
    const song = currentAlbumSongs[currentSongIndex];
    fetchSongDetails(song.cid, song.coverUrl, song.coverDeUrl);
}

// 播放下一首
function playNextSong() {
    if (currentAlbumSongs.length === 0) return;
    
    currentSongIndex = (currentSongIndex + 1) % currentAlbumSongs.length;
    const song = currentAlbumSongs[currentSongIndex];
    fetchSongDetails(song.cid, song.coverUrl, song.coverDeUrl);
}

// 跳轉進度
function seek(event) {
    if (!audioPlayer) return;
    const progressContainer = event.currentTarget;
    const rect = progressContainer.getBoundingClientRect();
    const seekPosition = (event.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = seekPosition * audioPlayer.duration;
    // 主動同步 UI
    updatePlayerProgress();
    syncLyrics(audioPlayer.currentTime);
}

// 設置音量
function setVolume(volume) {
    if (!audioPlayer) return;
    audioPlayer.volume = volume;
    
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.innerHTML = volume > 0 ? 
            (volume > 0.5 ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-down"></i>') : 
            '<i class="fas fa-volume-mute"></i>';
    }
}

// 靜音/取消靜音
function toggleMute() {
    if (!audioPlayer) return;
    
    audioPlayer.muted = !audioPlayer.muted;
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        if (audioPlayer.muted) {
            muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            muteBtn.innerHTML = audioPlayer.volume > 0.5 ? 
                '<i class="fas fa-volume-up"></i>' : 
                '<i class="fas fa-volume-down"></i>';
        }
    }
}

// 同步歌詞
function syncLyrics(currentTime) {
    if (!lyrics || lyrics.length === 0) return;
    
    const lyricsContainer = document.querySelector('.lyrics-container');
    if (!lyricsContainer || isUserScrolled) return;

    const lines = lyricsContainer.querySelectorAll('.lyrics-line');
    let activeLine = null;
    
    // 找到當前應該顯示的歌詞行
    for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i].time <= currentTime) {
            activeLine = i;
        } else {
            break;
        }
    }
    
    if (activeLine !== null && lines[activeLine]) {
        const activeElement = lines[activeLine];
        
        // 更新高亮狀態
        lines.forEach((line, index) => {
            line.classList.toggle('active', index === activeLine);
        });

        // 計算滾動位置
        const containerHeight = lyricsContainer.clientHeight;
        const lineTop = activeElement.offsetTop;
        const lineHeight = activeElement.clientHeight;
        const containerScrollTop = lyricsContainer.scrollTop;
        
        // 計算目標滾動位置，使當前歌詞行位於容器中間
        let targetScroll = lineTop - (containerHeight / 2) + (lineHeight / 2);
        
        // 確保不會滾動超出範圍
        const maxScroll = lyricsContainer.scrollHeight - containerHeight;
        targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
        
        // 只有當目標位置與當前位置相差超過一定距離時才滾動
        const scrollThreshold = 50; // 可以調整這個值來控制滾動的靈敏度
        if (Math.abs(targetScroll - containerScrollTop) > scrollThreshold) {
            lyricsContainer.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        }
    }
}

// 獲取歌詞
async function fetchLyrics(lyricUrl) {
  try {
    // 修正雙斜線問題
    const proxyUrl = `https://monstersiren-web-api.vercel.app/proxy-lyrics?url=${encodeURIComponent(lyricUrl)}`;
    
    console.log('正在請求歌詞:', proxyUrl);
    const response = await fetch(proxyUrl); // 移除no-cors模式
    
    if (!response.ok) {
      console.error('服務器返回錯誤:', await response.text());
      throw new Error(`HTTP錯誤! 狀態碼: ${response.status}`);
    }
    
    const lrcText = await response.text();
    console.log('成功獲取歌詞內容:', lrcText.slice(0, 100) + '...'); // 顯示部分內容
    
    return parseLRC(lrcText);
  } catch (error) {
    console.error('完整錯誤訊息:', error);
    throw new Error(`無法獲取歌詞: ${error.message}`);
  }
}

// 監聽手動滾動事件
function setupLyricsScrollListener() {
    const lyricsContainer = document.querySelector('.lyrics-container');
    if (!lyricsContainer) return;

    let scrollTimeout;
    let isScrolling = false;

    lyricsContainer.addEventListener('scroll', () => {
        isUserScrolled = true;
        isScrolling = true;
        showBackToCurrentButton();
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
            // 5秒無操作後恢復自動滾動
            setTimeout(() => {
                if (!isScrolling) {
                    isUserScrolled = false;
                }
            }, 5000);
        }, 150);
    });
}

// 顯示返回當前位置按鈕
function showBackToCurrentButton() {
  let btn = document.getElementById('back-to-current');
  if (!btn) {
      btn = document.createElement('button');
      btn.id = 'back-to-current';
      btn.innerHTML = '回到當前歌詞';
      btn.className = 'back-to-current-btn';
      btn.onclick = () => {
          isUserScrolled = false;
          syncLyrics(audioPlayer.currentTime);
          btn.remove();
      };
      document.querySelector('.player-container').appendChild(btn);
  }
}

// 解析LRC歌詞
function parseLRC(lrc) {
    const lines = lrc.split('\n');
    const result = [];
    
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    
    lines.forEach(line => {
        const match = timeRegex.exec(line);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const milliseconds = parseInt(match[3].length === 3 ? match[3] : match[3] * 10);
            
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            
            if (text) {
                result.push({ time, text });
            }
        }
    });
    
    return result;
}

// 顯示模態框
function showModal() {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

// 關閉模態框
function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
}

// 顯示加載狀態
function showLoading() {
    loadingSpinner.style.display = 'flex';
}

// 隱藏加載狀態
function hideLoading() {
    loadingSpinner.style.display = 'none';
}

// 顯示錯誤
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    albumsContainer.appendChild(errorDiv);
}

// 格式化時間
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === undefined) return '--:--';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 格式化持續時間
function formatDuration(duration) {
    if (!duration || isNaN(duration)) return '--:--';
    return formatTime(duration);
}

// 載入所有歌曲
async function loadAllSongsForBar() {
    const listDiv = document.getElementById('all-songs-list');
    listDiv.innerHTML = `<div class="all-songs-loading">載入中...</div>`;
    
    try {
        const response = await fetch("https://monstersiren-web-api.vercel.app/api/songs");
        if (!response.ok) {
            throw new Error('無法獲取歌曲列表');
        }
        
        const { data } = await response.json();
        const songs = data.list.map(song => ({
            ...song,
            artistes: song.artists || ['未知演出者']
        }));
        
        // 更新全局變量並渲染列表
        allSongsForBar = songs;
        renderAllSongsBarList();
        
    } catch (error) {
        console.error('載入歌曲時出錯:', error);
        listDiv.innerHTML = `<div class="all-songs-loading">載入失敗，請重試</div>`;
    }
}

// 渲染所有歌曲列表
function renderAllSongsBarList() {
    const listDiv = document.getElementById('all-songs-list');
    if (!allSongsForBar || allSongsForBar.length === 0) {
        listDiv.innerHTML = `<div class="all-songs-loading">沒有找到歌曲</div>`;
        return;
    }
    
    listDiv.innerHTML = allSongsForBar.map((song, idx) => `
        <div class="song-list-item" data-idx="${idx}">
            <span>${song.name}</span>
            <span style="color:#8b949e;font-size:0.9em;">- ${song.artistes.join(', ')}</span>
        </div>
    `).join('');
    
    // 綁定點擊事件
    listDiv.querySelectorAll('.song-list-item').forEach(item => {
        item.onclick = function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            playSongFromAllSongsBar(idx);
            // 收合Bar
            document.getElementById('all-songs-list').style.display = 'none';
            document.getElementById('toggle-all-songs-btn').innerHTML = '所有歌曲 ▼';
        };
    });
}

// 點擊Bar歌曲播放
function playSongFromAllSongsBar(idx) {
    const song = allSongsForBar[idx];
    if (!song) return;
    
    // 使用現有的 fetchSongDetails 播放
    fetchSongDetails(song.cid, song.albumCover, song.albumCover);
}

// ====== 播放歌曲時同步更新 Now Playing 標題與下拉清單 ======
function updateNowPlayingTitle(name) {
    if (nowPlayingTitle) nowPlayingTitle.textContent = name || '正在撥放歌曲名稱';
}

function showNowPlayingDropdown() {
    if (!nowPlayingDropdownList) return;
    nowPlayingDropdownList.innerHTML = '';
    nowPlayingDropdownList.classList.add('show');
    nowPlayingSongList.forEach((song, idx) => {
        const item = document.createElement('div');
        item.className = 'dropdown-song-item' + (idx === nowPlayingSongIndex ? ' active' : '');
        item.textContent = song.name;
        item.onclick = () => {
            if (idx !== nowPlayingSongIndex) {
                playFromNowPlayingDropdown(idx);
            }
            nowPlayingDropdownList.classList.remove('show');
        };
        nowPlayingDropdownList.appendChild(item);
    });
}

function hideNowPlayingDropdown() {
    if (nowPlayingDropdownList) nowPlayingDropdownList.classList.remove('show');
}

if (nowPlayingDropdownBtn) {
    nowPlayingDropdownBtn.onclick = function(e) {
        e.stopPropagation();
        if (nowPlayingDropdownList.classList.contains('show')) {
            hideNowPlayingDropdown();
        } else {
            showNowPlayingDropdown();
        }
    };
    document.body.addEventListener('click', hideNowPlayingDropdown);
}

function playFromNowPlayingDropdown(idx) {
    if (nowPlayingSongList.length === 0) return;
    nowPlayingSongIndex = idx;
    const song = nowPlayingSongList[idx];
    if (song.albumCover) {
        fetchSongDetails(song.cid, song.albumCover, song.albumCover);
    } else {
        // 專輯播放
        playSongFromAlbum(idx, song.coverUrl, song.coverDeUrl);
    }
}

// ====== 播放歌曲時同步更新 Now Playing 標題與下拉清單 ======
function syncNowPlaying(songList, idx) {
    nowPlayingSongList = songList;
    nowPlayingSongIndex = idx;
    updateNowPlayingTitle(songList[idx]?.name);
}

// 修改 playSongFromAlbum/playSongFromAllSongsBar 以同步
const _playSongFromAlbum = playSongFromAlbum;
playSongFromAlbum = function(index, coverUrl, coverDeUrl) {
    syncNowPlaying(currentAlbumSongs, index);
    _playSongFromAlbum(index, coverUrl, coverDeUrl);
};
const _playSongFromAllSongsBar = playSongFromAllSongsBar;
playSongFromAllSongsBar = function(idx) {
    syncNowPlaying(allSongsForBar, idx);
    _playSongFromAllSongsBar(idx);
};
// 進入頁面時初始化
if (currentAlbumSongs.length > 0) {
    syncNowPlaying(currentAlbumSongs, 0);
} else if (allSongsForBar.length > 0) {
    syncNowPlaying(allSongsForBar, 0);
}
// fetchSongDetails 播放後也要更新標題
const _fetchSongDetails = fetchSongDetails;
fetchSongDetails = async function(songId, coverUrl, coverDeUrl) {
    await _fetchSongDetails(songId, coverUrl, coverDeUrl);
    // 找到目前播放的歌名
    let song = nowPlayingSongList[nowPlayingSongIndex];
    if (!song || song.cid !== songId) {
        const idx = nowPlayingSongList.findIndex(s => s.cid === songId);
        if (idx !== -1) {
            nowPlayingSongIndex = idx;
            song = nowPlayingSongList[idx];
        }
    }
    updateNowPlayingTitle(song?.name);
};

// ====== 全局唯一播放器控制與 UI 同步 ======
function syncPlayerUI(song) {
    if (!audioPlayer) return;
    if (audioPlayer.src !== song.audioUrl) {
        audioPlayer.src = song.audioUrl;
        audioPlayer.load();
    }
    audioPlayer.play().catch(() => {});
    // 更新彈窗UI
    updateNowPlayingTitle(song.name);
    // 歌名、歌手
    const playerInfo = document.querySelector('.player-info');
    if (playerInfo) {
        playerInfo.querySelector('h4').textContent = song.name;
        playerInfo.querySelector('p').textContent = song.artistes.join(', ');
    }
    // 封面
    const playerCover = document.querySelector('.player-cover img');
    if (playerCover) {
        playerCover.src = `https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(song.coverUrl)}`;
        playerCover.alt = song.name;
    }
    // 進度條、時間、音量、播放狀態
    updatePlayerProgress();
    updatePlayerVolume();
    updatePlayPauseBtn();
    // 歌詞同步
    syncLyrics(audioPlayer.currentTime);
}

function updatePlayerProgress() {
    const progressBar = document.getElementById('progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    if (!audioPlayer || !progressBar || !currentTimeEl || !durationEl) return;
    const duration = audioPlayer.duration || 0;
    const currentTime = audioPlayer.currentTime || 0;
    const percent = duration ? (currentTime / duration) * 100 : 0;
    progressBar.style.width = percent + '%';
    currentTimeEl.textContent = formatTime(currentTime);
    durationEl.textContent = formatTime(duration);
}

function updatePlayerVolume() {
    const volumeSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');
    if (!audioPlayer || !volumeSlider || !muteBtn) return;
    volumeSlider.value = audioPlayer.volume;
    muteBtn.innerHTML = audioPlayer.muted || audioPlayer.volume === 0
        ? '<i class="fas fa-volume-mute"></i>'
        : (audioPlayer.volume > 0.5 ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-down"></i>');
}

function updatePlayPauseBtn() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (!audioPlayer || !playPauseBtn) return;
    playPauseBtn.innerHTML = audioPlayer.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
}

// 控制按鈕事件
function togglePlay() {
    if (!audioPlayer) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
    updatePlayPauseBtn();
}
function playPreviousSong() {
    if (nowPlayingSongList.length === 0) return;
    let idx = nowPlayingSongIndex - 1;
    if (idx < 0) idx = nowPlayingSongList.length - 1;
    playFromNowPlayingDropdown(idx);
}
function playNextSong() {
    if (nowPlayingSongList.length === 0) return;
    let idx = (nowPlayingSongIndex + 1) % nowPlayingSongList.length;
    playFromNowPlayingDropdown(idx);
}
function seek(event) {
    if (!audioPlayer) return;
    const progressContainer = event.currentTarget;
    const rect = progressContainer.getBoundingClientRect();
    const seekPosition = (event.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = seekPosition * audioPlayer.duration;
    // 主動同步 UI
    updatePlayerProgress();
    syncLyrics(audioPlayer.currentTime);
}
function setVolume(volume) {
    if (!audioPlayer) return;
    audioPlayer.volume = volume;
    updatePlayerVolume();
}
function toggleMute() {
    if (!audioPlayer) return;
    audioPlayer.muted = !audioPlayer.muted;
    updatePlayerVolume();
}

// 監聽全局 audio 狀態，動態同步 UI
if (audioPlayer) {
    audioPlayer.addEventListener('timeupdate', () => {
        updatePlayerProgress();
        syncLyrics(audioPlayer.currentTime);
    });
    audioPlayer.addEventListener('durationchange', updatePlayerProgress);
    audioPlayer.addEventListener('volumechange', updatePlayerVolume);
    audioPlayer.addEventListener('play', updatePlayPauseBtn);
    audioPlayer.addEventListener('pause', updatePlayPauseBtn);
    audioPlayer.addEventListener('ended', playNextSong);
}