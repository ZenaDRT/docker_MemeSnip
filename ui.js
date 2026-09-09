/**
 * MemeSnip UI Rendering & Component Controller
 * Renders high-fidelity cards, manages modals, dropdowns, and toast alerts
 */

class UIController {
  constructor() {
    this.gridElement = document.getElementById('memeGrid');
    this.toastContainer = document.getElementById('toastContainer');
    this.currentFilter = 'all';
    this.currentSearch = '';
    this.currentSort = 'newest';
    this.filterUploaderOnly = null;
  }

  /**
   * Render meme grid
   */
  async renderMemes() {
    if (!this.gridElement) return;

    // Show loading skeleton if empty
    if (!this.gridElement.children.length) {
      this.gridElement.innerHTML = this._getLoadingSkeletons();
    }

    try {
      let memes = await window.memeService.getMemes({
        category: this.currentFilter,
        searchQuery: this.currentSearch,
        sortBy: this.currentSort
      });

      if (this.filterUploaderOnly) {
        memes = memes.filter(meme => meme.uploader === this.filterUploaderOnly);
      }

      this._updatePillCounts();
      this._updateUploaderFilterBanner();

      if (memes.length === 0) {
        const emptyTitle = this.filterUploaderOnly
          ? "You haven't uploaded any memes yet"
          : "No memes found in this category";
        const emptyText = this.filterUploaderOnly
          ? "Upload your first meme to see it here!"
          : "Be the first legend to upload a snippet or try searching for another keyword!";

        this.gridElement.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3>${this._escapeHtml(emptyTitle)}</h3>
            <p>${this._escapeHtml(emptyText)}</p>
            <button class="btn-empty-upload" onclick="window.ui.openModal('uploadModal')">
              + Upload a Meme
            </button>
          </div>
        `;
        return;
      }

      this.gridElement.innerHTML = '';
      const fragment = document.createDocumentFragment();

      memes.forEach(meme => {
        const card = this.createMemeCardElement(meme);
        fragment.appendChild(card);
      });

      this.gridElement.appendChild(fragment);

      // Attach video controllers
      const videoContainers = this.gridElement.querySelectorAll('.custom-video-container');
      videoContainers.forEach(container => window.videoPlayer.attach(container));

    } catch (err) {
      console.error('Failed to render memes:', err);
      this.showToast('Failed to load memes. Please try again.', 'error');
    }
  }

  /**
   * Create a single meme card element
   */
  createMemeCardElement(meme) {
    const card = document.createElement('div');
    card.className = 'meme-card';
    card.dataset.id = meme.id;
    card.dataset.category = meme.category;

    const hasLiked = window.memeService.hasLiked(meme.id);
    const formattedDate = this._formatRelativeTime(meme.createdAt);

    let mediaHTML = '';
    if (meme.category === 'video' || (meme.mediaType && meme.mediaType.includes('video'))) {
      mediaHTML = `
        <div class="media-wrapper">
          <span class="media-badge badge-video">VIDEO</span>
          <div class="custom-video-container" title="Click to play / pause video">
            <video src="${meme.mediaUrl}" playsinline loop preload="metadata"></video>
            <button class="video-play-overlay" aria-label="Play Video">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="video-status-indicator">
              <span class="pulse-dot"></span> PLAYING
            </div>
          </div>
        </div>
      `;
    } else if (meme.category === 'gif' || (meme.mediaType && meme.mediaType.includes('gif'))) {
      mediaHTML = `
        <div class="media-wrapper">
          <span class="media-badge badge-gif">GIF</span>
          <img src="${meme.mediaUrl}" alt="${this._escapeHtml(meme.title)}" loading="lazy" />
        </div>
      `;
    } else {
      mediaHTML = `
        <div class="media-wrapper">
          <span class="media-badge">IMAGE</span>
          <img src="${meme.mediaUrl}" alt="${this._escapeHtml(meme.title)}" loading="lazy" />
        </div>
      `;
    }

    card.innerHTML = `
      ${mediaHTML}
      <div class="card-info">
        <div class="card-title-row">
          <h4 class="meme-title" title="${this._escapeHtml(meme.title)}">${this._escapeHtml(meme.title)}</h4>
        </div>
        
        <div class="uploader-row">
          <div class="uploader-info">
            <img src="${meme.uploaderAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(meme.uploader)}" 
                 alt="${this._escapeHtml(meme.uploader)}" 
                 class="uploader-avatar" />
            <span class="uploader-name">${this._escapeHtml(meme.uploader)}</span>
          </div>
          <span class="uploader-date">${formattedDate}</span>
        </div>

        <div class="card-actions-row">
          <div class="card-social-actions">
            <button class="btn-like ${hasLiked ? 'liked' : ''}" 
                    data-action="like" 
                    data-id="${meme.id}" 
                    title="${hasLiked ? 'Unlike' : 'Like'}">
              <svg viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span class="like-count">${meme.likes || 0}</span>
            </button>

            <button class="btn-share" 
                    data-action="share" 
                    data-id="${meme.id}" 
                    title="Copy Meme Link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
          </div>

          <!-- Noticeably clickable and distinct Download Button -->
          <button class="btn-download" 
                  data-action="download" 
                  data-id="${meme.id}" 
                  title="Download this ${meme.category}">
            <svg viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download</span>
          </button>
        </div>
      </div>
    `;

    return card;
  }

  /**
   * "My Uploads" Filter (triggered from Profile modal Uploads stat)
   */
  _updateUploaderFilterBanner() {
    const banner = document.getElementById('uploaderFilterBanner');
    const bannerText = document.getElementById('uploaderFilterBannerText');
    if (!banner || !bannerText) return;

    if (this.filterUploaderOnly) {
      bannerText.textContent = `Showing memes uploaded by ${this.filterUploaderOnly}`;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  showMyUploads(displayName) {
    if (!displayName) return;
    this.filterUploaderOnly = displayName;
    this.closeModal('profileModal');
    this.renderMemes();
    if (this.gridElement) {
      this.gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  clearUploaderFilter() {
    this.filterUploaderOnly = null;
    this.renderMemes();
  }

  /**
   * Update category pill badges
   */
  async _updatePillCounts() {
    try {
      const counts = await window.memeService.getCounts();
      const countAll = document.getElementById('countAll');
      const countImages = document.getElementById('countImages');
      const countVideos = document.getElementById('countVideos');
      const countGifs = document.getElementById('countGifs');

      if (countAll) countAll.textContent = counts.all;
      if (countImages) countImages.textContent = counts.images;
      if (countVideos) countVideos.textContent = counts.videos;
      if (countGifs) countGifs.textContent = counts.gifs;

      const userStatMemeCount = document.getElementById('userStatMemeCount');
      if (userStatMemeCount) userStatMemeCount.textContent = counts.all;
    } catch (e) {
      console.warn('Failed to update counts:', e);
    }
  }

  /**
   * Toast Notification Dispatcher
   */
  showToast(message, type = 'info', duration = 3000) {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSVG = '';
    if (type === 'success') {
      iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'warning') {
      iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSVG}<span>${this._escapeHtml(message)}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  /**
   * Shared Meme Preview (opened via #meme-{id} links)
   */
  openMediaPreviewModal(card, memeId) {
    const body = document.getElementById('mediaPreviewBody');
    const viewBtn = document.getElementById('mediaPreviewViewBtn');
    if (!body || !card) return;

    body.innerHTML = '';

    const sourceVideo = card.querySelector('.media-wrapper video');
    const sourceImg = card.querySelector('.media-wrapper img');

    if (sourceVideo) {
      const video = document.createElement('video');
      video.src = sourceVideo.src;
      video.controls = true;
      video.playsInline = true;
      video.autoplay = false;
      body.appendChild(video);
    } else if (sourceImg) {
      const img = document.createElement('img');
      img.src = sourceImg.src;
      img.alt = sourceImg.alt || '';
      body.appendChild(img);
    }

    if (viewBtn) viewBtn.dataset.id = memeId;

    this.openModal('mediaPreviewModal');
  }

  viewSharedMemeOnSite() {
    const viewBtn = document.getElementById('mediaPreviewViewBtn');
    const memeId = viewBtn ? viewBtn.dataset.id : null;
    this.closeModal('mediaPreviewModal');
    if (memeId) this.scrollToMemeCard(memeId);
  }

  scrollToMemeCard(memeId) {
    const card = document.querySelector(`.meme-card[data-id="${CSS.escape(memeId)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('meme-card-highlight');
    setTimeout(() => card.classList.remove('meme-card-highlight'), 2500);
  }

  /**
   * Modal Management
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  closeAllModals() {
    const modals = document.querySelectorAll('.modal-backdrop');
    modals.forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
  }

  /**
   * Helpers
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  _formatRelativeTime(isoString) {
    if (!isoString) return 'recently';
    let time = 0;
    if (typeof isoString === 'object' && typeof isoString.seconds === 'number') {
      time = isoString.seconds * 1000 + (isoString.nanoseconds || 0) / 1e6;
    } else if (typeof isoString?.toDate === 'function') {
      time = isoString.toDate().getTime();
    } else if (typeof isoString === 'number') {
      time = isoString;
    } else {
      time = new Date(isoString).getTime();
    }
    if (isNaN(time) || time === 0) return 'recently';

    const diffMs = Date.now() - time;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffDay > 0) return `${diffDay}d ago`;
    if (diffHr > 0) return `${diffHr}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'just now';
  }

  _getLoadingSkeletons() {
    return Array(10).fill(0).map(() => `
      <div class="meme-card skeleton">
        <div class="media-wrapper skeleton-shimmer"></div>
        <div class="card-info">
          <div style="height: 16px; width: 80%; border-radius: 4px;" class="skeleton-shimmer"></div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <div style="width: 24px; height: 24px; border-radius: 50%;" class="skeleton-shimmer"></div>
            <div style="height: 12px; width: 45%; border-radius: 4px;" class="skeleton-shimmer"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
            <div style="height: 26px; width: 64px; border-radius: 6px;" class="skeleton-shimmer"></div>
            <div style="height: 28px; width: 88px; border-radius: 9999px;" class="skeleton-shimmer"></div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// Global Singleton Export
window.ui = new UIController();
