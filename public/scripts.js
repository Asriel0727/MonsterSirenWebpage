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

// DOM 元素
const albumsContainer = document.getElementById('albums');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const loadingSpinner = document.getElementById('loading');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingDropdownBtn = document.getElementById('now-playing-dropdown-btn');
const nowPlayingDropdownList = document.getElementById('now-playing-dropdown-list');

let nowPlayingSongList = [];
let nowPlayingSongIndex = 0;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 1. 獲取必要的 DOM 元素
    audioPlayer = document.getElementById('audio-player');
    const toggleBtn = document.getElementById('toggle-all-songs-btn');
    const listDiv = document.getElementById('all-songs-list');

    // 2. 執行初始設定
    fetchAlbums();
    setupEventListeners();

    // 3. 附加「所有歌曲」列表的點擊事件
    if (toggleBtn && listDiv) {
        toggleBtn.addEventListener('click', async () => {
            const isHidden = listDiv.style.display === 'none' || listDiv.style.display === '';
            if (isHidden) {
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
        listDiv.style.display = 'none';
    }
    
    // 4. 【核心修正】在這裡附加全局播放器的事件監聽器
    // 這個區塊必須在 audioPlayer 被賦值後執行
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
        
        const marqueeContent = albumDiv.querySelector('.marquee-content');
        const container = albumDiv.querySelector('.marquee-container');
        
        setTimeout(() => {
            if (marqueeContent.scrollWidth > container.clientWidth) {
                container.style.overflow = 'hidden';
                marqueeContent.style.animation = 'marquee 10s linear infinite';
            } else {
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
    const songsPerPage = 4; // 設定每頁顯示的歌曲數量
    const totalPages = Math.ceil(album.songs.length / songsPerPage);

    /**
     * 動態渲染指定頁碼的歌曲列表
     * @param {number} page - 要顯示的頁碼
     */
    const renderPage = (page) => {
        const songListContent = document.getElementById('song-list-content');
        if (!songListContent) return;

        const startIndex = (page - 1) * songsPerPage;
        const endIndex = startIndex + songsPerPage;
        const pageSongs = album.songs.slice(startIndex, endIndex);

        // 生成當前頁歌曲的 HTML
        songListContent.innerHTML = pageSongs.map((song, index) => {
            const originalIndex = startIndex + index; // 計算在完整歌曲列表中的原始索引
            return `
                <div class="song-item">
                    <div class="song-number">${originalIndex + 1}</div>
                    <div class="song-title">${song.name}</div>
                    <div class="song-artist">${song.artistes.join(', ')}</div>
                    <div class="song-action">
                        <button onclick="playSongFromAlbum(${originalIndex}, '${album.coverUrl}', '${album.coverDeUrl}')">
                            播放
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 如果存在分頁控制項，則更新其狀態
        const pageIndicator = document.getElementById('page-indicator');
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');

        if (pageIndicator && prevBtn && nextBtn) {
            pageIndicator.textContent = `第 ${page} / ${totalPages} 頁`;
            prevBtn.disabled = (page === 1);
            nextBtn.disabled = (page === totalPages);
            
            // 將當前頁碼存儲在按鈕上，以便點擊時讀取
            prevBtn.dataset.currentPage = page;
            nextBtn.dataset.currentPage = page;
        }
        // 呼叫跑馬燈函式
        applyMarqueeToLongTitles('#song-list-content');
    };

    // 將換頁函式掛載到 window 物件上，以便 onclick 可以呼叫
    window.changeAlbumSongPage = (direction, button) => {
        const currentPage = parseInt(button.dataset.currentPage, 10);
        const newPage = currentPage + direction;
        if (newPage >= 1 && newPage <= totalPages) {
            renderPage(newPage);
        }
    };

    let songListContainerHtml;

    if (totalPages > 1) {
        // 如果總頁數大於1，則生成帶有分頁控制項的容器
        songListContainerHtml = `
            <div class="song-list-header">
                <h3>曲目列表</h3>
                <div class="pagination-controls">
                    <button id="prev-page-btn" onclick="window.changeAlbumSongPage(-1, this)">&lt;</button>
                    <span id="page-indicator"></span>
                    <button id="next-page-btn" onclick="window.changeAlbumSongPage(1, this)">&gt;</button>
                </div>
            </div>
            <div id="song-list-content"></div>
        `;
    } else {
        // 如果只有一頁或沒有歌曲，則正常顯示
        songListContainerHtml = `
            <h3>曲目列表</h3>
            <div id="song-list-content">${album.songs.map((song, index) => `
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
            `).join('')}</div>
        `;
    }

    // 構建完整的 Modal 內容
    modalBody.innerHTML = `
        <div class="album-details-grid">
            <div class="album-details-left">
                <img src="https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(album.coverUrl)}" alt="${album.name} Cover" class="album-grid-cover">
                <h2>${album.name}</h2>
                <h3>${album.belong}</h3>
                <p class="album-intro">${album.intro || '暫無介紹'}</p>
            </div>
            <div class="album-details-right">
                <img src="https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(album.coverDeUrl)}" alt="${album.name} Main Visual" class="album-grid-visual">
                <div class="song-list">
                    ${songListContainerHtml}
                </div>
            </div>
        </div>
    `;

    showModal();

    if (totalPages > 1) {
        renderPage(1); // 分頁情況下，由 renderPage 內部呼叫跑馬燈函式
    } else {
        // 非分頁情況下，也需要呼叫
        applyMarqueeToLongTitles('#song-list-content');
    }

    // 初始載入第一頁的內容
    renderPage(1);
}

/**
 * 新增：檢查指定選擇器下的標題，如果文字太長，則套用跑馬燈效果
 * @param {string} containerSelector - 要檢查的容器的 CSS 選擇器
 */
function applyMarqueeToLongTitles(containerSelector) {
    // 使用 setTimeout確保 DOM 元素已完全渲染完畢
    setTimeout(() => {
        const titles = document.querySelectorAll(`${containerSelector} .song-title`);
        titles.forEach(titleElement => {
            // scrollWidth 是元素的總寬度，clientWidth 是可見部分的寬度
            if (titleElement.scrollWidth > titleElement.clientWidth) {
                const originalText = titleElement.innerText;
                // 用 marquee-content 包裹文字，並啟動動畫
                titleElement.innerHTML = `<span class="marquee-content">${originalText}</span>`;
                const marqueeSpan = titleElement.querySelector('.marquee-content');
                
                // 動態設定動畫，這樣 CSS 中的 [style*="animation"] 選擇器就會生效
                const duration = originalText.length / 5; // 根據文字長度調整滾動速度
                marqueeSpan.style.animation = `marquee ${duration < 8 ? 8 : duration}s linear infinite`;
            }
        });
    }, 100); // 延遲 100 毫秒執行
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
        
        // 查找原始歌曲資訊以獲取演出者列表
        const originalSong = nowPlayingSongList.find(s => s.cid === songId) || {};
        
        const song = {
            ...apiSong,
            artistes: originalSong.artistes || ['未知演出者'],
            coverUrl: coverUrl,
            coverDeUrl: coverDeUrl,
            audioUrl: apiSong.sourceUrl || '',
        };
        
        lyrics = []; // 重置歌詞
        let lyricsContent = '<p class="no-lyrics">暫無歌詞</p>';
        if (song.lyricUrl) {
            try {
                lyrics = await fetchLyrics(song.lyricUrl);
            } catch (e) {
                console.warn('歌詞加載失敗:', e);
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
        
        renderSongPlayer(song, lyricsContent);
        
    } catch (error) {
        console.error('Error fetching song details:', error);
        showError('加載歌曲詳情失敗，請稍後重試');
    } finally {
        hideLoading();
    }
}

// 渲染歌曲播放器
function renderSongPlayer(song, lyricsContent) {
    modalBody.innerHTML = `
        <div class="player-container">
            <div class="player-header">
                <div class="player-cover">
                    <img src="https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(song.coverUrl)}" 
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
                        <input type="range" id="volume-slider" min="0" max="1" step="0.05" value="1" 
                               oninput="setVolume(this.value)">
                    </div>
                </div>
            </div>
            ${lyricsContent}
        </div>
    `;
    syncPlayerUI(song);
    showModal();
    setupLyricsScrollListener();
}

// 同步歌詞
function syncLyrics(currentTime) {
    if (!lyrics || lyrics.length === 0) return;
    
    const lyricsContainer = document.querySelector('.lyrics-container');
    if (!lyricsContainer || isUserScrolled) return;

    const lines = lyricsContainer.querySelectorAll('.lyrics-line');
    let activeLineIndex = -1;
    
    for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i].time <= currentTime) {
            activeLineIndex = i;
        } else {
            break;
        }
    }
    
    if (activeLineIndex !== -1 && lines[activeLineIndex]) {
        const activeElement = lines[activeLineIndex];
        
        if (!activeElement.classList.contains('active')) {
             lines.forEach(line => line.classList.remove('active'));
             activeElement.classList.add('active');
             
            const containerHeight = lyricsContainer.clientHeight;
            const lineTop = activeElement.offsetTop;
            const lineHeight = activeElement.clientHeight;
            
            let targetScroll = lineTop - (containerHeight / 2) + (lineHeight / 2);
            
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
    const proxyUrl = `https://monstersiren-web-api.vercel.app/proxy-lyrics?url=${encodeURIComponent(lyricUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`HTTP錯誤! 狀態碼: ${response.status}`);
    }
    const lrcText = await response.text();
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

    lyricsContainer.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        isUserScrolled = true;
        scrollTimeout = setTimeout(() => {
            isUserScrolled = false;
        }, 5000); // 5秒無操作後恢復自動滾動
    });
}

// 解析LRC歌詞
function parseLRC(lrc) {
    const lines = lrc.split('\n');
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/;
    
    lines.forEach(line => {
        const match = timeRegex.exec(line);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const milliseconds = parseInt(match[3].padEnd(3, '0'));
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            if (text) {
                result.push({ time, text });
            }
        }
    });
    return result;
}

// 顯示/關閉模態框
function showModal() {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
}

// 顯示/隱藏加載狀態
function showLoading() {
    loadingSpinner.style.display = 'flex';
}

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
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// "所有歌曲" 列表相關功能
async function loadAllSongsForBar() {
    const listDiv = document.getElementById('all-songs-list');
    listDiv.innerHTML = `<div class="all-songs-loading">載入中...</div>`;
    
    try {
        const response = await fetch("https://monstersiren-web-api.vercel.app/api/songs");
        if (!response.ok) throw new Error('無法獲取歌曲列表');
        
        const { data } = await response.json();
        allSongsForBar = data.list.map(song => ({
            ...song,
            artistes: song.artists || ['未知演出者']
        }));
        
        renderAllSongsBarList();
        
    } catch (error) {
        console.error('載入歌曲時出錯:', error);
        listDiv.innerHTML = `<div class="all-songs-loading">載入失敗，請重試</div>`;
    }
}

function renderAllSongsBarList() {
    const listDiv = document.getElementById('all-songs-list');
    if (!allSongsForBar || allSongsForBar.length === 0) {
        listDiv.innerHTML = `<div class="all-songs-loading">沒有找到歌曲</div>`;
        return;
    }
    
    listDiv.innerHTML = allSongsForBar.map((song, idx) => `
        <div class="song-list-item" onclick="playSongFromAllSongsBar(${idx})">
            <span>${song.name}</span>
            <span style="color:#8b949e;font-size:0.9em;">- ${song.artistes.join(', ')}</span>
        </div>
    `).join('');
}

function playSongFromAllSongsBar(idx) {
    const song = allSongsForBar[idx];
    if (!song) return;

    // 將所有歌曲列表設置為當前播放列表
    syncNowPlaying(allSongsForBar, idx);

    // 獲取歌曲詳情並播放
    fetchSongDetails(song.cid, song.albumCover, song.albumCover);

    // 收合列表
    const listDiv = document.getElementById('all-songs-list');
    const toggleBtn = document.getElementById('toggle-all-songs-btn');
    if (listDiv && toggleBtn) {
        listDiv.style.display = 'none';
        toggleBtn.innerHTML = '所有歌曲 ▼';
    }
}

// "Now Playing" 下拉列表功能
function updateNowPlayingTitle(name) {
    if (nowPlayingTitle) nowPlayingTitle.textContent = name || '正在撥放歌曲名稱';
}

function showNowPlayingDropdown() {
    if (!nowPlayingDropdownList) return;
    nowPlayingDropdownList.innerHTML = '';
    nowPlayingSongList.forEach((song, idx) => {
        const item = document.createElement('div');
        item.className = 'dropdown-song-item' + (idx === nowPlayingSongIndex ? ' active' : '');
        item.textContent = song.name;
        item.onclick = (e) => {
            e.stopPropagation();
            if (idx !== nowPlayingSongIndex) {
                playFromNowPlayingDropdown(idx);
            }
            hideNowPlayingDropdown();
        };
        nowPlayingDropdownList.appendChild(item);
    });
    nowPlayingDropdownList.classList.add('show');
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
    const song = nowPlayingSongList[nowPlayingSongIndex];
    if(!song) return;
    
    updateNowPlayingTitle(song.name);
    
    fetchSongDetails(song.cid, song.coverUrl || song.albumCover, song.coverDeUrl || song.albumCover);
}

// 同步當前播放列表
function syncNowPlaying(songList, idx) {
    nowPlayingSongList = songList;
    nowPlayingSongIndex = idx;
    updateNowPlayingTitle(songList[idx]?.name);
}

// ====== 全局唯一播放器控制與 UI 同步 ======
function syncPlayerUI(song) {
    if (!audioPlayer) return;
    if (audioPlayer.src !== song.audioUrl) {
        audioPlayer.src = song.audioUrl;
        audioPlayer.load();
    }
    audioPlayer.play().catch((e) => console.log('Autoplay was prevented.', e));
    
    const playerCoverContainer = document.querySelector('.player-cover');
    if (playerCoverContainer) playerCoverContainer.classList.add('playing');
    
    updatePlayerProgress();
    updatePlayerVolume();
    updatePlayPauseBtn();
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
    
    volumeSlider.value = audioPlayer.muted ? 0 : audioPlayer.volume;
    if (audioPlayer.muted || audioPlayer.volume === 0) {
        muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else if (audioPlayer.volume > 0.5) {
        muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
        muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
    }
}

function updatePlayPauseBtn() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playerCoverContainer = document.querySelector('.player-cover');
    if (!audioPlayer || !playPauseBtn) return;

    if (audioPlayer.paused) {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (playerCoverContainer) playerCoverContainer.classList.remove('playing');
    } else {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if (playerCoverContainer) playerCoverContainer.classList.add('playing');
    }
}

// ====== 播放器控制按鈕事件 ======
function togglePlay() {
    if (!audioPlayer) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

function playPreviousSong() {
    if (nowPlayingSongList.length === 0) return;
    let newIndex = nowPlayingSongIndex - 1;
    if (newIndex < 0) {
        newIndex = nowPlayingSongList.length - 1;
    }
    playFromNowPlayingDropdown(newIndex);
}

function playNextSong() {
    if (nowPlayingSongList.length === 0) return;
    const newIndex = (nowPlayingSongIndex + 1) % nowPlayingSongList.length;
    playFromNowPlayingDropdown(newIndex);
}

function seek(event) {
    if (!audioPlayer || isNaN(audioPlayer.duration)) return;
    const progressContainer = event.currentTarget;
    const rect = progressContainer.getBoundingClientRect();
    const seekPosition = (event.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = seekPosition * audioPlayer.duration;
    updatePlayerProgress();
    syncLyrics(audioPlayer.currentTime);
}

function setVolume(volume) {
    if (!audioPlayer) return;
    audioPlayer.muted = false;
    audioPlayer.volume = parseFloat(volume);
}

function toggleMute() {
    if (!audioPlayer) return;
    audioPlayer.muted = !audioPlayer.muted;
    // UI 會由 'volumechange' 事件自動更新
}