// 全局變量
let audioPlayer;
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentSongIndex = 0;
let currentAlbumSongs = [];
let lyrics = [];
let isPlaying = false;

// DOM 元素
const albumsContainer = document.getElementById('albums');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const loadingSpinner = document.getElementById('loading');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    fetchAlbums();
    setupEventListeners();
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
        container.style.overflow = 'hidden';
        marqueeContent.style.animation = 'marquee 10s linear infinite';
        
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
        currentAlbumSongs = album.songs.map(song => ({
          ...song,
          artistes: song.artistes || album.artistes || ['未知演出者'],
          coverUrl: album.coverUrl,
          coverDeUrl: album.coverDeUrl
      }));
        renderAlbumDetails(album);
    } catch (error) {
        console.error('Error fetching album details:', error);
        showError('加載專輯詳情失敗，請稍後重試');
    } finally {
        hideLoading();
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
                        <div class="song-duration">${formatDuration(song.duration)}</div>
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
            audioUrl: apiSong.sourceUrl || ''
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
                <audio id="audio-player" src="${song.audioUrl}"></audio>
                
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
    
    setupAudioPlayer();
    showModal();
}

// 設置音頻播放器
function setupAudioPlayer() {
    audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer) return;
    
    const playPauseBtn = document.getElementById('play-pause-btn');
    const progressBar = document.getElementById('progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const volumeSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');
    const playerCover = document.querySelector('.player-cover');
    
    // 加載元數據
    audioPlayer.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatTime(audioPlayer.duration);
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
    if (!lyricsContainer) return;
    
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
    
    // 更新歌詞高亮
    lines.forEach((line, index) => {
        line.classList.toggle('active', index === activeLine);
    });
    
    // 滾動到當前歌詞
    if (activeLine !== null && lines[activeLine]) {
        const containerHeight = lyricsContainer.clientHeight;
        const lineTop = lines[activeLine].offsetTop;
        const lineHeight = lines[activeLine].clientHeight;
        
        lyricsContainer.scrollTo({
            top: lineTop - containerHeight / 2 + lineHeight / 2,
            behavior: 'smooth'
        });
    }
}

// 獲取歌詞
async function fetchLyrics(lyricUrl) {
  try {
    const proxyUrl = `https://monstersiren-web-api.vercel.app//proxy-lyrics?url=${encodeURIComponent(lyricUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Failed to fetch lyrics. Status: ${response.status}`);
    const lrcText = await response.text();
    return parseLRC(lrcText);
} catch (error) {
    console.error('Error fetching lyrics:', error);
    throw error;
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
    
    if (audioPlayer) {
        audioPlayer.pause();
        isPlaying = false;
    }
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
    if (isNaN(seconds)) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 格式化持續時間 (假設duration是秒數)
function formatDuration(duration) {
    if (!duration) return '--:--';
    return formatTime(duration);
}