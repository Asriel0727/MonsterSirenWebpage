let audioPlayer;
let lyricsInterval;
let currentPage = 1;

// 加載所有專輯
async function fetchAlbums(page = 1) {
  try {
    const response = await fetch(
      "http://monstersiren-demo.vercel.app/api/albums"
    );
    const { data: albums } = await response.json();
    const albumContainer = document.getElementById("albums");

    if (page === 1) {
      albumContainer.innerHTML = ""; // 首頁清空列表
    }
    albums.forEach((album) => {
      const albumDiv = document.createElement("div");
      albumDiv.classList.add("album");
      albumDiv.innerHTML = `
                <img loading="lazy" src="http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(
                  album.coverUrl
                )}" alt="${album.name}" onload="this.classList.add('loaded')">
                <div class="marquee-item-wrapper">
                    <h2 class = "marquee-item">${album.name}</h2>
                </div>
                <p>${album.artistes.join(", ")}</p>
                <button onclick="fetchAlbumDetails('${
                  album.cid
                }')">查看詳細</button>
            `;

      // 检查文本宽度并添加滚动效果
      setTimeout(() => {
        const marqueeItem = albumDiv.querySelector(".marquee-item");
        const wrapper = albumDiv.querySelector(".marquee-item-wrapper");
        if (marqueeItem.scrollWidth > wrapper.offsetWidth) {
          marqueeItem.classList.add("marquee-scroll");
        }
      }, 0);

      albumContainer.appendChild(albumDiv);
    });
  } catch (error) {
    console.error("Error fetching albums:", error);
  }
}

// 滾動加載
function handleScroll() {
  const albumContainer = document.getElementById("albums");
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    currentPage++;
    fetchAlbums(currentPage);
  }
}

// 顯示專輯詳細信息
async function fetchAlbumDetails(albumId) {
  try {
    const response = await fetch(
      `http://monstersiren-demo.vercel.app/api/album/${albumId}/detail`
    );
    const { data: album } = await response.json();

    renderDetails("album", album);
  } catch (error) {
    console.error("Error fetching album details:", error);
  }
}

async function fetchSongDetails(songId, coverUrl, coverDeUrl) {
  try {
    const response = await fetch(
      `http://monstersiren-demo.vercel.app/api/song/${songId}`
    );
    const { data: song } = await response.json();

    // 補全音頻 URL
    song.audioUrl = song.sourceUrl || "";

    // 處理歌曲歌詞
    let lyricsContent = "";
    if (song.lyricUrl) {
      const lyrics = await fetchLyrics(song.lyricUrl);
      if (lyrics.length > 0) {
        console.log(lyrics);
        lyricsContent = `
                <div id="lyrics">${lyrics
                  .map((line) => `<p data-time="${line.time}">${line.text}</p>`)
                  .join("")}</div>`;
      } else {
        lyricsContent = `<p id="no-lyrics">暫無歌詞</p>`;
      }
    } else {
      lyricsContent = `<p id="no-lyrics">暫無歌詞</p>`;
    }

    // 使用傳入的專輯封面 URL 資料
    const albumData = {
      coverUrl: coverUrl,
      coverDeUrl: coverDeUrl,
      lyricsContent: lyricsContent,
    };

    // 將歌曲詳細資料與專輯封面一起渲染
    renderDetails("song", song, albumData);

    // 確保在渲染後再取得 audioPlayer
    setTimeout(() => {
      const audioElement = document.querySelector("audio");
      audioPlayer = audioElement;
      if (audioPlayer && song.lyricUrl) {
        audioPlayer.addEventListener("timeupdate", syncLyrics);
      }
    }, 0);
  } catch (error) {
    console.error("Error fetching song details:", error);
  }
}

function renderDetails(mode, data, albumData = {}) {
  const modalBody = document.getElementById("modal-body");

  if (mode === "album") {
    modalBody.innerHTML = `
<div class="album-details-modal-content">
    <div class="album-details-modal-left">
        <img loading="lazy" src="http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(
          data.coverUrl
        )}" alt="${data.name}" onload="this.classList.add('loaded')">
        <h2>${data.name}</h2>
        <h5>${data.belong}</h5>
        <p>${data.intro}</p>
    </div>
    <div class="album-details-modal-right">
        <img loading="lazy" src="http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(
          data.coverDeUrl
        )}" alt="${
      data.name
    }" onload="this.classList.add('loaded')">                        
        <h3>曲目</h3>
        <div class="album-songs-list">
            ${data.songs
              .map(
                (song) => `
                <div class="album-song-item">
                    <p>${song.name} - ${song.artistes.join(", ")} 
                    <button onclick="fetchSongDetails('${song.cid}', '${
                  data.coverUrl
                }', '${data.coverDeUrl}')">查看歌曲</button></p>
                </div>
            `
              )
              .join("")}
        </div>
    </div>
</div>
`;
  } else if (mode === "song") {
    const coverUrl = data.coverUrl || albumData.coverUrl || "";
    const coverDeUrl = data.coverDeUrl || albumData.coverDeUrl || "";
    const lyrics = albumData.lyricsContent
      ? albumData.lyricsContent
      : "<p id='no-lyrics'>暫無歌詞</p>";

    modalBody.innerHTML = `
<div class="album-details-modal-content">
    <div class="album-details-modal-left">
        <img loading="lazy" src="http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(
          coverUrl
        )}" alt="${data.name}" onload="this.classList.add('loaded')">
        <h2>${data.name}</h2>
        <!-- 自定义播放器 -->
        <div class="player">
            <audio id="audio-player">
                <source src="${data.audioUrl}" type="audio/mpeg">
                您的瀏覽器不支持音頻播放。
            </audio>
            <div class="controls">
                <button id="prev-btn">
                    <i class="fas fa-backward"></i>
                </button>
                <button id="play-pause-btn">
                    <i class="fas fa-play"></i>
                </button>
                <button id="next-btn">
                    <i class="fas fa-forward"></i>
                </button>
                <div class="progress-container">
                    <div id="progress-bar" class="progress-bar"></div>
                </div>
                <span id="current-time">00:00</span> / <span id="duration">00:00</span>
                <button id="mute-btn">
                    <i class="fas fa-volume-up"></i>
                </button>
                <input type="range" id="volume-slider" min="0" max="1" step="0.1" value="1">
            </div>
        </div>
    </div>
    <div class="album-details-modal-right">
        <img loading="lazy" src="http://monstersiren-demo.vercel.app/proxy-image?url=${encodeURIComponent(
          coverDeUrl
        )}" alt="${data.name}" onload="this.classList.add('loaded')">
        <h3>歌詞</h3>
        <div class="lyrics">
            <p>${lyrics}</p>
        </div>
    </div>
</div>
`;
  }

  showModal();
}

// 解析歌詞
async function fetchLyrics(lyricUrl) {
  try {
    const response = await fetch(lyricUrl);
    const lrc = await response.text();
    return parseLRC(lrc);
  } catch (error) {
    console.error("Error fetching lyrics:", error);
    return []; // 若無法獲取歌詞，返回空數組
  }
}

function parseLRC(lrc) {
  const lines = lrc.split("\n");
  return lines
    .map((line) => {
      const match = line.match(/\[(\d{2}):(\d{2}).(\d{2,3})\](.+)/);
      if (!match) return null;
      const time =
        parseInt(match[1]) * 60 +
        parseInt(match[2]) +
        parseFloat(`0.${match[3]}`);
      const text = match[4].trim();
      return { time, text };
    })
    .filter(Boolean);
}

function syncLyrics() {
  const currentTime = audioPlayer.currentTime;
  const lyrics = document.querySelectorAll("#lyrics p");
  let activeLine = null;

  lyrics.forEach((line) => {
    const time = parseFloat(line.dataset.time);
    if (time <= currentTime) {
      lyrics.forEach((p) => p.classList.remove("active"));
      line.classList.add("active");
      activeLine = line;
    }
  });

  // 自動滾動到當前歌詞
  if (activeLine) {
    const lyricsContainer = document.getElementById("lyrics");
    const containerHeight = lyricsContainer.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineHeight = activeLine.clientHeight;

    // 計算高亮行要滾動的位置，並避免超出邊界
    const targetScrollTop = Math.max(
      0,
      Math.min(
        lineTop - containerHeight / 2 + lineHeight / 2,
        lyricsContainer.scrollHeight - containerHeight
      )
      // lineTop - containerHeight - lineHeight * 3.5
    );

    // 平滑滾動到目標位置
    lyricsContainer.scrollTo({
      top: targetScrollTop,
      behavior: "smooth",
      duration: scrollSpeed,
    });
  }
}

// 彈窗操作
function showModal() {
  const modal = document.getElementById("modal");
  modal.classList.add("show");
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("show");
  if (audioPlayer) audioPlayer.pause();
}

// 初始加載
fetchAlbums();
window.addEventListener("scroll", handleScroll);
