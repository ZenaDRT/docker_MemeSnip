/**
 * MemeSnip Custom Non-Interactive Video Player
 * Features:
 * - Single-tap Play/Pause toggle
 * - All native HTML5 controls, scrubbing, seek bars disabled
 * - Context menu (right click) and dragging locked on video
 * - Auto-pauses background videos when playing a new one
 */

class VideoPlayerController {
  constructor() {
    this.currentlyPlaying = null;
    this.initGlobalListeners();
  }

  initGlobalListeners() {
    // Prevent context menu globally on meme video elements
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.custom-video-container')) {
        e.preventDefault();
        return false;
      }
    });
  }

  /**
   * Initializes a custom video container element
   */
  attach(container) {
    const video = container.querySelector('video');
    const overlay = container.querySelector('.video-play-overlay');
    if (!video || !overlay) return;

    // Toggle playback on click
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay(container, video);
    });

    // Prevent default touch/drag gestures that might invoke native mini-players
    video.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    video.addEventListener('dragstart', (e) => e.preventDefault());

    // Update UI on video state changes
    video.addEventListener('play', () => {
      container.classList.add('playing');
      overlay.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    });

    video.addEventListener('pause', () => {
      container.classList.remove('playing');
      overlay.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    });

    video.addEventListener('ended', () => {
      container.classList.remove('playing');
      overlay.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    });
  }

  togglePlay(container, video) {
    if (video.paused) {
      // Pause any other playing video first
      if (this.currentlyPlaying && this.currentlyPlaying !== video) {
        this.currentlyPlaying.pause();
      }
      
      video.play().then(() => {
        this.currentlyPlaying = video;
      }).catch(err => {
        console.warn('Playback error or blocked autoplay:', err);
      });
    } else {
      video.pause();
      if (this.currentlyPlaying === video) {
        this.currentlyPlaying = null;
      }
    }
  }

  pauseAll() {
    if (this.currentlyPlaying) {
      this.currentlyPlaying.pause();
      this.currentlyPlaying = null;
    }
  }
}

// Global Singleton Export
window.videoPlayer = new VideoPlayerController();
