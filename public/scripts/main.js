// 获取所有专辑列表
async function fetchAlbums() {
    try {
        const response = await fetch('http://monstersiren-demo.vercel.app/api/albums');
        const albumsData = await response.json();
        displayAlbums(albumsData.data);
    } catch (error) {
        console.error('Error fetching albums:', error);
    }
}

// 显示专辑列表
function displayAlbums(albums) {
    const albumsContainer = document.getElementById('albums');
    
    albums.forEach(album => {
        const albumElement = document.createElement('div');
        albumElement.classList.add('album');
        
        // 使用本地代理加载图片
        const proxiedCoverUrl = `http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(album.coverUrl)}`;

        albumElement.innerHTML = `
            <img src="${proxiedCoverUrl}" alt="${album.name}">
            <h2><div class="marquee-container">
                <div class="marquee-content">${album.name}</div>
            </div></h2>
            <p><div class="marquee-container">
                <div class="marquee-content">${album.artistes.join(', ')}</div>
            </div></p>
            <button class="view-album" data-album-id="${album.cid}">查看專輯</button>
        `;
        
        albumsContainer.appendChild(albumElement);

        // 动态检测文本是否超出容器宽度
        const albumTitle = albumElement.querySelector('.marquee-content');
        const container = albumElement.querySelector('.marquee-container');
        
        if (albumTitle.scrollWidth > container.offsetWidth) {
            // 如果文本内容超出容器宽度，则启用跑马灯效果
            albumTitle.style.animationPlayState = 'running';
        } else {
            albumTitle.style.transform = 'translateX(0)';
        }
    });

    // 给每个 "查看專輯" 按钮绑定事件
    document.querySelectorAll('.view-album').forEach(button => {
        button.addEventListener('click', function() {
            fetchAlbumDetails(this.dataset.albumId);
        });
    });
}

// 获取单个专辑的详细信息
async function fetchAlbumDetails(albumId) {
    try {
        const response = await fetch(`http://monstersiren-demo.vercel.app/api/album/${albumId}/detail`);
        const albumDetailsData = await response.json();
        displayAlbumDetails(albumDetailsData.data);
    } catch (error) {
        console.error('Error fetching album details:', error);
    }
}

// 显示专辑详细信息和歌曲列表
function displayAlbumDetails(album) {
    toggleSidebar(); // 打开侧边栏

    const albumContent = document.getElementById('albumContent');
    const songsList = document.getElementById('songsList');

    if (albumContent && songsList) {
        const proxiedCoverDeUrl = album.coverDeUrl ? 
            `http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(album.coverDeUrl)}` : '';

        albumContent.innerHTML = `
            <img src="${proxiedCoverDeUrl}" alt="${album.name}" />
            <h3>${album.name}</h3>
            <p>${album.intro}</p>
        `;

        songsList.innerHTML = ''; // 清空之前的歌曲列表

        if (album.songs && album.songs.length > 0) {
            album.songs.forEach(song => {
                const songElement = document.createElement('div');
                songElement.classList.add('song-item');
                
                // 创建歌曲名称和艺术家信息
                const songText = document.createElement('p');
                songText.textContent = `${song.name} - ${song.artistes.join(', ')}`;
                
                // 创建播放按钮
                const playButton = document.createElement('button');
                playButton.textContent = '播放歌曲';
                
                // 使用 data- 属性来存储 song.cid
                playButton.dataset.songId = song.cid;
        
                // 使用 addEventListener 绑定点击事件
                playButton.addEventListener('click', function() {
                    playSong(this.dataset.songId);
                });
        
                // 将歌曲名称和按钮添加到 songElement
                songElement.appendChild(songText);
                songElement.appendChild(playButton);
        
                // 将 songElement 添加到 songsList
                songsList.appendChild(songElement);
            });
        } else {
            songsList.innerHTML = "<p>No songs available</p>";
        }
    }
}

// 显示/隐藏侧边栏，并动态调整专辑列表的右边距
function toggleSidebar() {
    const albumDetails = document.getElementById('albumDetails');
    albumDetails.classList.toggle('active');

    const albumsContainer = document.getElementById('albums');

    if (albumDetails.classList.contains('active')) {
        albumsContainer.style.marginRight = '350px';
    } else {
        albumsContainer.style.marginRight = '0';
    }
}

let isPlaying = false;

// 切换播放器的展开/收缩状态
function togglePlayer() {
    const playerContainer = document.getElementById('playerContainer');
    playerContainer.classList.toggle('active');
}

// 获取单个歌曲并播放
async function playSong(songId) {
    try {
        const song_response = await fetch(`http://monstersiren-demo.vercel.app/api/song/${songId}`);
        const songData = await song_response.json();

        const albumCid = songData.data.albumCid;
        const album_response = await fetch(`http://monstersiren-demo.vercel.app/api/album/${albumCid}/detail`);
        const albumDetail = await album_response.json();

        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = songData.data.sourceUrl;
        audioPlayer.play();

        let proxiedCoverUrl = '';
        if (albumDetail.data.coverUrl) {
            proxiedCoverUrl = `http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(albumDetail.data.coverUrl)}`;
        } else {
            proxiedCoverUrl = '/path/to/default-image.jpg'; // 替换成默认图片路径
        }

        document.getElementById('songTitle').textContent = songData.data.name;
        document.getElementById('currentSongTitle').textContent = songData.data.name;
        document.getElementById('albumCover').src = proxiedCoverUrl;

        if (songData.data.lyricUrl) {            
            const proxiedLyricUrl = `http://monstersiren-demo.vercel.app/proxy-lyrics?url=${encodeURIComponent(songData.data.lyricUrl)}`;
            const lyric_response = await fetch(proxiedLyricUrl);
            const lyrics = await lyric_response.text();
            const parsedLyrics = parseLyrics(lyrics);
            displayLyrics(parsedLyrics, audioPlayer);
        } else {
            document.getElementById('lyricsContainer').innerHTML = "<p>No lyrics available</p>";
        }

        isPlaying = true;
    } catch (error) {
        console.error('Error fetching song or album details:', error);
    }
}

// 解析歌词
function parseLyrics(lyrics) {
    const lines = lyrics.split('\n');
    const parsedLyrics = [];
    const regex = /\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/;

    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseFloat(match[2]);
            const time = minutes * 60 + seconds;
            const text = match[3];
            parsedLyrics.push({ time, text });
        }
    });

    return parsedLyrics;
}

// 显示歌词
function displayLyrics(parsedLyrics, audioPlayer) {
    const lyricsContainer = document.getElementById('lyricsContainer');
    const timeBar = document.getElementById('timeBar');
    const lyricsText = document.createElement('div');
    
    lyricsText.classList.add('lyrics');
    parsedLyrics.forEach((line, index) => {
        const lyricElement = document.createElement('p');
        lyricElement.textContent = line.text;
        lyricElement.setAttribute('data-time', line.time);
        lyricsText.appendChild(lyricElement);
    });

    lyricsContainer.innerHTML = '';
    lyricsContainer.appendChild(lyricsText);

    audioPlayer.ontimeupdate = () => {
        const currentTime = audioPlayer.currentTime;

        parsedLyrics.forEach((line, index) => {
            const lyricElement = lyricsText.children[index];
            if (currentTime >= line.time) {
                lyricElement.classList.add('highlight');
            } else {
                lyricElement.classList.remove('highlight');
            }
        });

        updateTimeBar(currentTime, audioPlayer.duration);
    };
}

// 更新播放时间条
function updateTimeBar(currentTime, duration) {
    const timeBar = document.getElementById('timeBar');
    const percentage = (currentTime / duration) * 100;
    timeBar.style.width = `${percentage}%`;
}

// 初始化應用
document.addEventListener('DOMContentLoaded', () => {
    fetchAlbums();

    document.getElementById('expandButton').addEventListener('click', togglePlayer);
    document.getElementById('closeOverlay').addEventListener('click', () => {
        document.getElementById('albumDetails').classList.remove('active');
    });
});

// 全屏覆蓋開關
function toggleOverlay() {
    document.getElementById('albumDetails').classList.toggle('active');
}

// 音樂播放器展開/收起
function togglePlayer() {
    document.getElementById('playerContainer').classList.toggle('active');
}
