/**
 * MemeSnip Admin Dashboard Controller — Phase 3: Advanced Moderation Controls
 * Handles authentication, Firestore moderation queue, search/filter/sort pipeline, pagination, editing, and deletion
 */

import { auth, db } from "../firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

class AdminController {
  constructor() {
    this.currentAdmin = null;
    this.isVerifying = false;

    // Data Pipeline State
    this.memes = [];           // Raw source of truth from Firestore
    this.filteredMemes = [];   // After search and category filter
    this.sortedMemes = [];     // After sorting
    this.pagedMemes = [];      // Current page slice

    // Control States
    this.searchQuery = '';
    this.selectedCategory = 'all';
    this.selectedSort = 'newest';
    this.currentPage = 1;
    this.pageSize = 8; // Sensible default page size

    // Modal Active Targets
    this.pendingDeleteMeme = null;
    this.pendingEditMeme = null;

    // DOM Elements - Auth & Views
    this.loaderEl = document.getElementById('adminAuthLoader');
    this.loginSectionEl = document.getElementById('adminLoginSection');
    this.dashboardSectionEl = document.getElementById('adminDashboardSection');
    this.userChipEl = document.getElementById('adminUserChip');
    this.loginForm = document.getElementById('adminLoginForm');
    this.emailInput = document.getElementById('adminEmail');
    this.passwordInput = document.getElementById('adminPassword');
    this.submitBtn = document.getElementById('btnAdminSignIn');
    this.alertBox = document.getElementById('loginAlertBox');
    this.alertMsg = document.getElementById('loginAlertMessage');
    this.toastContainer = document.getElementById('toastContainer');

    // DOM Elements - Header & Stats
    this.headerUsername = document.getElementById('headerAdminUsername');
    this.headerRole = document.getElementById('headerAdminRole');
    this.dashAdminName = document.getElementById('dashAdminName');
    this.dashAdminRole = document.getElementById('dashAdminRole');
    this.dashTotalMemes = document.getElementById('dashTotalMemes');
    this.dashTotalUsers = document.getElementById('dashTotalUsers');

    // DOM Elements - Moderation Toolbar & Controls (Phase 3)
    this.queueContainer = document.getElementById('moderationList');
    this.queueLoadingEl = document.getElementById('queueLoadingState');
    this.queueEmptyEl = document.getElementById('queueEmptyState');
    this.queueEmptyTitle = document.getElementById('queueEmptyTitle');
    this.queueEmptyMessage = document.getElementById('queueEmptyMessage');
    this.btnResetFilters = document.getElementById('btnResetFilters');
    this.queueCountBadge = document.getElementById('queueCountBadge');

    this.queueSearchInput = document.getElementById('queueSearchInput');
    this.queueSearchClear = document.getElementById('queueSearchClear');
    this.queueCategoryFilter = document.getElementById('queueCategoryFilter');
    this.queueSortSelect = document.getElementById('queueSortSelect');
    this.btnRefreshQueue = document.getElementById('btnRefreshQueue');

    // DOM Elements - Pagination (Phase 3)
    this.paginationWrapper = document.getElementById('queuePagination');
    this.rangeInfoEl = document.getElementById('queueRangeInfo');
    this.btnPrevPage = document.getElementById('btnPrevPage');
    this.btnNextPage = document.getElementById('btnNextPage');
    this.pageNumbersContainer = document.getElementById('queuePageNumbers');

    // DOM Elements - Edit Modal (Phase 3)
    this.editModal = document.getElementById('editMemeModal');
    this.btnEditModalClose = document.getElementById('btnEditModalClose');
    this.btnCancelEdit = document.getElementById('btnCancelEdit');
    this.editForm = document.getElementById('editMemeForm');
    this.editMemeId = document.getElementById('editMemeId');
    this.editMemeCreator = document.getElementById('editMemeCreator');
    this.editPreviewThumb = document.getElementById('editPreviewThumb');
    this.editMemeTitle = document.getElementById('editMemeTitle');
    this.editMemeCategory = document.getElementById('editMemeCategory');
    this.editMemeTags = document.getElementById('editMemeTags');
    this.btnSaveEdit = document.getElementById('btnSaveEdit');

    // DOM Elements - Delete Confirmation Modal (Phase 2.5)
    this.deleteModal = document.getElementById('deleteConfirmModal');
    this.btnDeleteModalClose = document.getElementById('btnDeleteModalClose');
    this.btnCancelDelete = document.getElementById('btnCancelDelete');
    this.btnConfirmDelete = document.getElementById('btnConfirmDelete');
    this.deletePreviewThumb = document.getElementById('deletePreviewThumb');
    this.deletePreviewTitle = document.getElementById('deletePreviewTitle');
    this.deletePreviewUploader = document.getElementById('deletePreviewUploader');
    this.deletePreviewAvatar = document.getElementById('deletePreviewAvatar');
    this.deletePreviewId = document.getElementById('deletePreviewId');

    this.init();
  }

  init() {
    this.bindEvents();
    this.listenAuthState();
  }

  bindEvents() {
    // Login form submission
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Sign out buttons
    const btnHeaderSignOut = document.getElementById('btnHeaderSignOut');
    if (btnHeaderSignOut) {
      btnHeaderSignOut.addEventListener('click', () => this.handleSignOut());
    }

    const btnDashSignOut = document.getElementById('btnDashSignOut');
    if (btnDashSignOut) {
      btnDashSignOut.addEventListener('click', () => this.handleSignOut());
    }

    // Search Input (Real-time live filtering without Firestore network requests)
    if (this.queueSearchInput) {
      this.queueSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (this.queueSearchClear) {
          this.queueSearchClear.style.display = this.searchQuery ? 'flex' : 'none';
        }
        this.currentPage = 1; // Reset to page 1 on search change
        this.processAndRender();
      });
    }

    // Clear Search Button
    if (this.queueSearchClear) {
      this.queueSearchClear.addEventListener('click', () => {
        if (this.queueSearchInput) {
          this.queueSearchInput.value = '';
          this.searchQuery = '';
          this.queueSearchClear.style.display = 'none';
          this.currentPage = 1;
          this.processAndRender();
          this.queueSearchInput.focus();
        }
      });
    }

    // Category Filter Dropdown
    if (this.queueCategoryFilter) {
      this.queueCategoryFilter.addEventListener('change', (e) => {
        this.selectedCategory = e.target.value;
        this.currentPage = 1; // Reset to page 1 on category change
        this.processAndRender();
      });
    }

    // Sort Dropdown (Phase 3)
    if (this.queueSortSelect) {
      this.queueSortSelect.addEventListener('change', (e) => {
        this.selectedSort = e.target.value;
        this.currentPage = 1; // Reset to page 1 on sort change
        this.processAndRender();
      });
    }

    // Reset / Clear Filters Button
    if (this.btnResetFilters) {
      this.btnResetFilters.addEventListener('click', () => {
        if (this.queueSearchInput) {
          this.queueSearchInput.value = '';
          this.searchQuery = '';
        }
        if (this.queueSearchClear) this.queueSearchClear.style.display = 'none';
        if (this.queueCategoryFilter) {
          this.queueCategoryFilter.value = 'all';
          this.selectedCategory = 'all';
        }
        if (this.queueSortSelect) {
          this.queueSortSelect.value = 'newest';
          this.selectedSort = 'newest';
        }
        this.currentPage = 1;
        this.processAndRender();
      });
    }

    // Refresh Queue Button
    if (this.btnRefreshQueue) {
      this.btnRefreshQueue.addEventListener('click', () => {
        this.fetchModerationQueue(true);
      });
    }

    // Pagination Navigation (Phase 3)
    if (this.btnPrevPage) {
      this.btnPrevPage.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.processAndRender();
        }
      });
    }

    if (this.btnNextPage) {
      this.btnNextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(this.sortedMemes.length / this.pageSize);
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.processAndRender();
        }
      });
    }

    // Edit Modal Events (Phase 3)
    if (this.btnEditModalClose) {
      this.btnEditModalClose.addEventListener('click', () => this.closeEditModal());
    }

    if (this.btnCancelEdit) {
      this.btnCancelEdit.addEventListener('click', () => this.closeEditModal());
    }

    if (this.editForm) {
      this.editForm.addEventListener('submit', (e) => this.handleSaveEdit(e));
    }

    if (this.editModal) {
      this.deleteModal?.addEventListener('click', (e) => {
        if (e.target === this.deleteModal) this.closeDeleteModal();
      });
      this.editModal.addEventListener('click', (e) => {
        if (e.target === this.editModal) this.closeEditModal();
      });
    }

    // Delete Modal Events (Phase 2.5)
    if (this.btnDeleteModalClose) {
      this.btnDeleteModalClose.addEventListener('click', () => this.closeDeleteModal());
    }

    if (this.btnCancelDelete) {
      this.btnCancelDelete.addEventListener('click', () => this.closeDeleteModal());
    }

    if (this.btnConfirmDelete) {
      this.btnConfirmDelete.addEventListener('click', () => this.executeDeleteMeme());
    }
  }

  /**
   * Listen to Firebase Auth state transitions
   */
  listenAuthState() {
    onAuthStateChanged(auth, async (user) => {
      if (this.isVerifying) return;
      this.showLoader(true);

      if (user) {
        await this.verifyAdminAccess(user);
      } else {
        this.currentAdmin = null;
        this.showLoginView();
      }
    });
  }

  /**
   * Check if current user's UID exists in Firestore `admins` collection
   */
  async verifyAdminAccess(user) {
    this.isVerifying = true;

    try {
      const adminRef = doc(db, "admins", user.uid);
      const adminSnap = await getDoc(adminRef);

      if (adminSnap.exists()) {
        const adminData = adminSnap.data() || {};
        const role = (adminData.role || "").toLowerCase();

        if (role === "administrator" || role === "admin" || !adminData.role) {
          this.currentAdmin = {
            uid: user.uid,
            email: user.email,
            displayName: adminData.displayName || user.displayName || user.email.split('@')[0],
            role: adminData.role || "administrator"
          };

          this.showDashboardView(this.currentAdmin);
          this.showToast(`Welcome back, ${this.currentAdmin.displayName}!`, 'success');

          // Load moderation queue
          await this.fetchModerationQueue();
          return;
        } else {
          console.warn(`[Admin Security] Unauthorized role "${adminData.role}" for UID: ${user.uid}`);
          await signOut(auth);
          this.currentAdmin = null;
          this.showLoginView();
          this.showAlert("Access denied. Administrator account required.");
          this.showToast("Access denied. Administrator account required.", "error");
        }
      } else {
        console.warn(`[Admin Security] Access denied for UID: ${user.uid}`);
        await signOut(auth);
        this.currentAdmin = null;
        this.showLoginView();
        this.showAlert("Access denied. Administrator account required.");
        this.showToast("Access denied. Administrator account required.", "error");
      }
    } catch (error) {
      console.error(error);
      await signOut(auth);
      this.currentAdmin = null;
      this.showLoginView();
      const realErrorMsg = error.message || error.code || String(error);
      this.showAlert(`Verification error: ${realErrorMsg}`);
      this.showToast(`Verification error: ${realErrorMsg}`, "error");
    } finally {
      this.isVerifying = false;
      this.showLoader(false);
    }
  }

  /**
   * Handle admin sign in form submission
   */
  async handleLogin(e) {
    e.preventDefault();
    this.hideAlert();

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      this.showAlert("Please enter both email and password.");
      return;
    }

    this.setSubmitLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("[Admin Sign In Error]", error);
      let errorMsg = "Invalid email or password.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = "Invalid administrator credentials.";
      } else if (error.code === 'auth/too-many-requests') {
        errorMsg = "Too many failed attempts. Please try again later.";
      } else if (error.message) {
        errorMsg = error.message;
      }
      this.showAlert(errorMsg);
      this.showToast(errorMsg, 'error');
      this.setSubmitLoading(false);
    }
  }

  /**
   * Handle admin sign out
   */
  async handleSignOut() {
    try {
      await signOut(auth);
      this.currentAdmin = null;
      this.memes = [];
      this.filteredMemes = [];
      this.sortedMemes = [];
      this.pagedMemes = [];
      this.showLoginView();
      this.showToast("Signed out of administrative session.", "info");
    } catch (err) {
      console.error("[Admin Sign Out Error]", err);
      this.showToast("Failed to sign out.", "error");
    }
  }

  /* ========================================================================
     MODERATION QUEUE & PIPELINE (PHASE 2, 2.5 & 3)
     ======================================================================== */

  /**
   * Fetch all meme documents from Cloud Firestore
   */
  async fetchModerationQueue(isManualRefresh = false) {
    this.showQueueLoading(true);

    try {
      const memesSnap = await getDocs(collection(db, "memes"));

      this.memes = memesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Populate dynamic categories in select dropdown if applicable
      this._populateCategoryDropdown();

      // Update stat count
      if (this.dashTotalMemes) {
        this.dashTotalMemes.textContent = this.memes.length;
      }

      if (this.dashTotalUsers) {
        const uniqueUploaders = new Set(this.memes.map(meme => meme.uploader).filter(Boolean));
        this.dashTotalUsers.textContent = uniqueUploaders.size;
      }

      // Execute Filter, Sort, Paginate & Render Pipeline
      this.processAndRender();

      if (isManualRefresh) {
        this.showToast(`Fetched ${this.memes.length} memes from Firestore.`, 'info');
      }
    } catch (err) {
      console.error("[Moderation Queue Fetch Error]", err);
      this.showToast(`Failed to load memes: ${err.message || err}`, 'error');
      this.processAndRender();
    } finally {
      this.showQueueLoading(false);
    }
  }

  /**
   * Complete Pipeline: Filter -> Sort -> Paginate -> Render UI
   */
  processAndRender() {
    if (!this.queueContainer) return;

    // 1. FILTERING (Search & Category)
    let filtered = [...this.memes];

    // Category filter
    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(meme => {
        const detected = this._detectMediaType(meme);
        const rawCategory = (meme.category || meme.mediaType || '').toLowerCase();
        return detected === this.selectedCategory || rawCategory === this.selectedCategory;
      });
    }

    // Search filter (Case-insensitive across Title, Creator/Uploader, Category, Tags, ID)
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter(meme => {
        const titleMatch = (meme.title || '').toLowerCase().includes(q);
        const creatorMatch = (meme.uploader || meme.uploaderName || meme.author || '').toLowerCase().includes(q);
        const categoryMatch = (meme.category || meme.mediaType || this._detectMediaType(meme)).toLowerCase().includes(q);
        const idMatch = (meme.id || '').toLowerCase().includes(q);
        const tagMatch = Array.isArray(meme.tags)
          ? meme.tags.some(t => String(t).toLowerCase().includes(q))
          : (typeof meme.tags === 'string' && meme.tags.toLowerCase().includes(q));

        return titleMatch || creatorMatch || categoryMatch || idMatch || tagMatch;
      });
    }

    this.filteredMemes = filtered;

    // 2. SORTING
    const sortMode = this.selectedSort;
    this.sortedMemes = [...this.filteredMemes].sort((a, b) => {
      if (sortMode === 'newest') {
        return this._getTimestamp(b.createdAt) - this._getTimestamp(a.createdAt);
      } else if (sortMode === 'oldest') {
        return this._getTimestamp(a.createdAt) - this._getTimestamp(b.createdAt);
      } else if (sortMode === 'title-asc') {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
      } else if (sortMode === 'title-desc') {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleB.localeCompare(titleA);
      }
      return 0;
    });

    const totalMatching = this.sortedMemes.length;

    // Update Badge
    if (this.queueCountBadge) {
      this.queueCountBadge.textContent = `${totalMatching} ${totalMatching === 1 ? 'item' : 'items'}`;
    }

    // 3. PAGINATION CALCULATION & CLAMPING
    const totalPages = Math.max(1, Math.ceil(totalMatching / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalMatching);
    this.pagedMemes = this.sortedMemes.slice(startIndex, endIndex);

    // 4. RENDER STATES
    // Case A: Catalog is completely empty
    if (this.memes.length === 0) {
      this.queueContainer.innerHTML = '';
      if (this.queueEmptyEl) {
        this.queueEmptyTitle.textContent = "No memes found in queue";
        this.queueEmptyMessage.textContent = "The Firestore collection is currently empty.";
        this.btnResetFilters.style.display = 'none';
        this.queueEmptyEl.style.display = 'flex';
      }
      if (this.paginationWrapper) this.paginationWrapper.style.display = 'none';
      return;
    }

    // Case B: Search / Filter produced 0 matching results
    if (totalMatching === 0) {
      this.queueContainer.innerHTML = '';
      if (this.queueEmptyEl) {
        this.queueEmptyTitle.textContent = "No matching memes found";
        this.queueEmptyMessage.textContent = "Try adjusting your search keywords or switching category filters.";
        this.btnResetFilters.style.display = 'inline-flex';
        this.queueEmptyEl.style.display = 'flex';
      }
      if (this.paginationWrapper) this.paginationWrapper.style.display = 'none';
      return;
    }

    // Case C: Results available -> Render Table & Pagination
    if (this.queueEmptyEl) this.queueEmptyEl.style.display = 'none';

    this.queueContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Table Header Row
    const headerRow = document.createElement('div');
    headerRow.className = 'moderation-header-row';
    headerRow.innerHTML = `
      <div>Thumbnail</div>
      <div>Title & Tags</div>
      <div>Category</div>
      <div>Creator</div>
      <div>Uploaded</div>
      <div>Engagement</div>
      <div style="text-align: right;">Actions</div>
    `;
    fragment.appendChild(headerRow);

    // Meme Rows for Current Page
    this.pagedMemes.forEach(meme => {
      const row = this.createModerationRowElement(meme);
      fragment.appendChild(row);
    });

    this.queueContainer.appendChild(fragment);

    // 5. UPDATE PAGINATION CONTROLS
    this.updatePaginationUI(startIndex, endIndex, totalMatching, totalPages);
  }

  /**
   * Update Pagination Bar, Range Info, and Page Number Buttons
   */
  updatePaginationUI(startIndex, endIndex, totalMatching, totalPages) {
    if (!this.paginationWrapper) return;

    if (totalMatching <= this.pageSize) {
      // Hide pagination controls if only 1 page is needed, but display range info
      this.paginationWrapper.style.display = 'flex';
      if (this.rangeInfoEl) {
        this.rangeInfoEl.textContent = `Showing 1–${totalMatching} of ${totalMatching} memes`;
      }
      if (this.btnPrevPage) this.btnPrevPage.disabled = true;
      if (this.btnNextPage) this.btnNextPage.disabled = true;
      if (this.pageNumbersContainer) this.pageNumbersContainer.innerHTML = '';
      return;
    }

    this.paginationWrapper.style.display = 'flex';

    if (this.rangeInfoEl) {
      this.rangeInfoEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalMatching} memes`;
    }

    if (this.btnPrevPage) {
      this.btnPrevPage.disabled = this.currentPage <= 1;
    }

    if (this.btnNextPage) {
      this.btnNextPage.disabled = this.currentPage >= totalPages;
    }

    // Build Page Number Buttons
    if (this.pageNumbersContainer) {
      this.pageNumbersContainer.innerHTML = '';

      for (let i = 1; i <= totalPages; i++) {
        // Show all pages if <= 6 pages, or show compact range around current
        if (totalPages <= 6 || i === 1 || i === totalPages || Math.abs(i - this.currentPage) <= 1) {
          const btn = document.createElement('button');
          btn.className = `page-num-btn ${i === this.currentPage ? 'active' : ''}`;
          btn.textContent = i;
          btn.addEventListener('click', () => {
            if (this.currentPage !== i) {
              this.currentPage = i;
              this.processAndRender();
            }
          });
          this.pageNumbersContainer.appendChild(btn);
        } else if (
          (i === 2 && this.currentPage > 3) ||
          (i === totalPages - 1 && this.currentPage < totalPages - 2)
        ) {
          if (!this.pageNumbersContainer.querySelector(`.dots-${i}`)) {
            const dots = document.createElement('span');
            dots.className = `page-dots dots-${i}`;
            dots.textContent = '...';
            this.pageNumbersContainer.appendChild(dots);
          }
        }
      }
    }
  }

  /**
   * Reusable component factory to render a single meme moderation row
   */
  createModerationRowElement(meme) {
    const row = document.createElement('div');
    row.className = 'moderation-row';
    row.dataset.memeId = meme.id;

    const mediaType = this._detectMediaType(meme);
    const mediaUrl = this._resolveMediaUrl(meme.mediaUrl);
    const title = this._escapeHtml(meme.title || 'Untitled Meme');

    // Creator field alignment (reads uploader and uploaderAvatar with fallback)
    const creatorName = this._escapeHtml(meme.uploader || meme.uploaderName || meme.author || 'Anonymous');
    const creatorAvatar = meme.uploaderAvatar ? this._resolveMediaUrl(meme.uploaderAvatar) : '../avatar.jpg';

    const relativeTime = this._formatRelativeTime(meme.createdAt);
    const fullDate = meme.createdAt ? new Date(this._getTimestamp(meme.createdAt)).toLocaleString() : 'Unknown';
    const likesCount = meme.likesCount ?? meme.likes ?? 0;
    const downloadsCount = meme.downloadsCount ?? meme.downloads ?? 0;

    // Tags rendering
    let tagsHtml = '';
    if (Array.isArray(meme.tags) && meme.tags.length > 0) {
      tagsHtml = meme.tags.slice(0, 2).map(t => `<span class="mod-tag-pill">#${this._escapeHtml(t)}</span>`).join('');
    }

    // Thumbnail markup
    let thumbMediaHtml = '';
    if (mediaType === 'video') {
      thumbMediaHtml = `
        <video 
          src="${mediaUrl}#t=0.5" 
          preload="metadata" 
          muted 
          playsinline 
          class="mod-thumb-video"
        ></video>
      `;
    } else {
      thumbMediaHtml = `
        <img 
          src="${mediaUrl}" 
          alt="${title}" 
          class="mod-thumb-img" 
          loading="lazy" 
          onerror="this.src='../icon.jpg'" 
        />
      `;
    }

    row.innerHTML = `
      <!-- Thumbnail Column -->
      <div class="mod-thumb-col" title="Preview Media">
        ${thumbMediaHtml}
        <span class="mod-format-badge">${mediaType.toUpperCase()}</span>
      </div>

      <!-- Title & Tags Column -->
      <div class="mod-title-col">
        <span class="mod-title" title="${title}">${title}</span>
        <div class="mod-meta-row">
          <span class="mod-id-tag">ID: ${meme.id ? meme.id.substring(0, 8) : 'unknown'}</span>
          ${tagsHtml}
        </div>
      </div>

      <!-- Category Column -->
      <div class="mod-category-col">
        <span class="mod-cat-pill ${mediaType}">
          ${mediaType}
        </span>
      </div>

      <!-- Creator Column (Phase 2.5: uses uploader & uploaderAvatar) -->
      <div class="mod-creator-col" title="Uploaded by ${creatorName}">
        <img 
          src="${creatorAvatar}" 
          alt="${creatorName}" 
          class="mod-creator-avatar" 
          onerror="this.src='../avatar.jpg'" 
        />
        <span class="mod-creator-name">${creatorName}</span>
      </div>

      <!-- Date Column -->
      <div class="mod-date-col" title="${fullDate}">
        <span>${relativeTime}</span>
      </div>

      <!-- Engagement Stats Column -->
      <div class="mod-stats-col">
        <div class="mod-stat-item" title="${likesCount} Likes">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          <span>${likesCount}</span>
        </div>
        <div class="mod-stat-item" title="${downloadsCount} Downloads" style="color: var(--text-muted);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span>${downloadsCount}</span>
        </div>
      </div>

      <!-- Action Column (View, Edit & Delete) -->
      <div class="mod-action-col">
        <a 
          href="${mediaUrl}" 
          target="_blank" 
          rel="noopener noreferrer" 
          class="btn-mod-view" 
          title="Open Media in New Tab"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>

        <button 
          type="button" 
          class="btn-mod-edit" 
          title="Edit Meme Details"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>

        <button 
          type="button" 
          class="btn-mod-delete" 
          title="Delete Meme Permanently"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    `;

    // Attach Edit Button Click Listener
    const editBtn = row.querySelector('.btn-mod-edit');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditModal(meme);
      });
    }

    // Attach Delete Button Click Listener
    const deleteBtn = row.querySelector('.btn-mod-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDeleteModal(meme);
      });
    }

    return row;
  }

  /* ========================================================================
     EDIT MODAL & FIRESTORE UPDATE LOGIC (PHASE 3)
     ======================================================================== */

  /**
   * Open Edit Modal with selected meme data
   */
  openEditModal(meme) {
    this.pendingEditMeme = meme;

    if (this.editMemeId) this.editMemeId.textContent = meme.id || '...';
    if (this.editMemeCreator) this.editMemeCreator.textContent = meme.uploader || meme.uploaderName || meme.author || 'Anonymous';
    if (this.editMemeTitle) this.editMemeTitle.value = meme.title || '';

    // Determine category
    const mediaType = this._detectMediaType(meme);
    if (this.editMemeCategory) {
      this.editMemeCategory.value = meme.category || meme.mediaType || mediaType;
    }

    // Format tags
    if (this.editMemeTags) {
      if (Array.isArray(meme.tags)) {
        this.editMemeTags.value = meme.tags.join(', ');
      } else {
        this.editMemeTags.value = meme.tags || '';
      }
    }

    // Preview thumbnail
    if (this.editPreviewThumb) {
      const mediaUrl = this._resolveMediaUrl(meme.mediaUrl);
      if (mediaType === 'video') {
        this.editPreviewThumb.innerHTML = `<video src="${mediaUrl}#t=0.5" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`;
      } else {
        this.editPreviewThumb.innerHTML = `<img src="${mediaUrl}" alt="${this._escapeHtml(meme.title)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='../icon.jpg'" />`;
      }
    }

    if (this.btnSaveEdit) {
      this.btnSaveEdit.disabled = false;
      this.btnSaveEdit.innerHTML = `<span class="btn-text">Save Changes</span>`;
    }

    this.openModal('editMemeModal');
  }

  /**
   * Close Edit Modal
   */
  closeEditModal() {
    this.pendingEditMeme = null;
    this.closeModal('editMemeModal');
  }

  /**
   * Handle Edit Form Submission -> Save Directly to Firestore
   */
  async handleSaveEdit(e) {
    e.preventDefault();
    if (!this.pendingEditMeme) return;

    const memeId = this.pendingEditMeme.id;
    const newTitle = this.editMemeTitle.value.trim();
    const newCategory = this.editMemeCategory.value;
    const rawTags = this.editMemeTags.value;

    const newTags = rawTags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    if (!newTitle) {
      this.showToast("Title cannot be empty.", "warning");
      return;
    }

    if (this.btnSaveEdit) {
      this.btnSaveEdit.disabled = true;
      this.btnSaveEdit.innerHTML = `<span>Saving...</span>`;
    }

    try {
      // Update directly in Cloud Firestore
      await updateDoc(doc(db, "memes", memeId), {
        title: newTitle,
        category: newCategory,
        mediaType: newCategory,
        tags: newTags
      });

      // Write audit log entry (Phase 4, Priority 2)
      try {
        await addDoc(collection(db, "admin_logs"), {
          action: "update",
          adminUID: this.currentAdmin?.uid || auth.currentUser?.uid,
          memeID: memeId,
          title: newTitle,
          timestamp: serverTimestamp()
        });
      } catch (logErr) {
        console.warn("[Admin Audit Log Warning] Failed to record update audit log:", logErr);
        this.showToast("Meme updated, but audit logging failed.", "warning");
      }

      // Update local in-memory dataset
      const idx = this.memes.findIndex(m => m.id === memeId);
      if (idx !== -1) {
        this.memes[idx].title = newTitle;
        this.memes[idx].category = newCategory;
        this.memes[idx].mediaType = newCategory;
        this.memes[idx].tags = newTags;
      }

      this.closeEditModal();
      this.processAndRender();
      this.showToast("Meme details updated successfully.", "success");
    } catch (err) {
      console.error("[Admin Edit Error]", err);
      this.showToast(`Failed to update meme: ${err.message || err}`, "error");
      if (this.btnSaveEdit) {
        this.btnSaveEdit.disabled = false;
        this.btnSaveEdit.innerHTML = `<span class="btn-text">Save Changes</span>`;
      }
    }
  }

  /* ========================================================================
     DELETE CONFIRMATION & DELETION LOGIC (PHASE 2.5)
     ======================================================================== */

  /**
   * Open Delete Confirmation Modal with selected meme preview
   */
  openDeleteModal(meme) {
    this.pendingDeleteMeme = meme;

    if (this.deletePreviewTitle) {
      this.deletePreviewTitle.textContent = meme.title || 'Untitled Meme';
    }

    if (this.deletePreviewUploader) {
      this.deletePreviewUploader.textContent = meme.uploader || meme.uploaderName || meme.author || 'Anonymous';
    }

    if (this.deletePreviewAvatar) {
      this.deletePreviewAvatar.src = meme.uploaderAvatar ? this._resolveMediaUrl(meme.uploaderAvatar) : '../avatar.jpg';
    }

    if (this.deletePreviewId) {
      this.deletePreviewId.textContent = meme.id || 'unknown';
    }

    if (this.deletePreviewThumb) {
      const mediaType = this._detectMediaType(meme);
      const mediaUrl = this._resolveMediaUrl(meme.mediaUrl);
      if (mediaType === 'video') {
        this.deletePreviewThumb.innerHTML = `<video src="${mediaUrl}#t=0.5" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`;
      } else {
        this.deletePreviewThumb.innerHTML = `<img src="${mediaUrl}" alt="${this._escapeHtml(meme.title)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='../icon.jpg'" />`;
      }
    }

    if (this.btnConfirmDelete) {
      this.btnConfirmDelete.disabled = false;
      this.btnConfirmDelete.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span class="btn-text">Delete Permanently</span>
      `;
    }

    this.openModal('deleteConfirmModal');
  }

  /**
   * Close Delete Confirmation Modal
   */
  closeDeleteModal() {
    this.pendingDeleteMeme = null;
    this.closeModal('deleteConfirmModal');
  }

  /**
   * Permanently delete meme document from Firestore
   */
  async executeDeleteMeme() {
    if (!this.pendingDeleteMeme) return;

    const memeToDelete = this.pendingDeleteMeme;
    const memeId = memeToDelete.id;

    if (this.btnConfirmDelete) {
      this.btnConfirmDelete.disabled = true;
      this.btnConfirmDelete.innerHTML = `<span>Deleting document...</span>`;
    }

    try {
      const memeTitle = memeToDelete.title || 'Untitled Meme';

      // Permanent deletion from Cloud Firestore
      await deleteDoc(doc(db, "memes", memeId));

      // Write audit log entry (Phase 4, Priority 2)
      try {
        await addDoc(collection(db, "admin_logs"), {
          action: "delete",
          adminUID: this.currentAdmin?.uid || auth.currentUser?.uid,
          memeID: memeId,
          title: memeTitle,
          timestamp: serverTimestamp()
        });
      } catch (logErr) {
        console.warn("[Admin Audit Log Warning] Failed to record delete audit log:", logErr);
        this.showToast("Meme deleted, but audit logging failed.", "warning");
      }

      // Remove from local memes array
      this.memes = this.memes.filter(m => m.id !== memeId);

      // Close modal
      this.closeDeleteModal();

      // Update stat count
      if (this.dashTotalMemes) {
        this.dashTotalMemes.textContent = this.memes.length;
      }

      // Re-run pipeline to recalculate pagination and view
      this.processAndRender();

      this.showToast(`"${memeTitle}" deleted permanently.`, 'success');
    } catch (err) {
      console.error("[Admin Delete Error]", err);
      this.showToast(`Failed to delete meme: ${err.message || err}`, 'error');
      if (this.btnConfirmDelete) {
        this.btnConfirmDelete.disabled = false;
        this.btnConfirmDelete.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span class="btn-text">Delete Permanently</span>
        `;
      }
    }
  }

  /* ========================================================================
     HELPER UTILITIES
     ======================================================================== */

  /**
   * Helper to parse and normalize timestamps safely from Firestore / ISO strings
   */
  _getTimestamp(val) {
    if (!val) return 0;
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return val.seconds * 1000 + (val.nanoseconds || 0) / 1e6;
    }
    if (typeof val === 'number') return val;
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Helper to populate dynamic categories in dropdown
   */
  _populateCategoryDropdown() {
    if (!this.queueCategoryFilter) return;

    const baseCategories = new Set(['all', 'image', 'video', 'gif']);
    this.memes.forEach(m => {
      if (m.category && typeof m.category === 'string') {
        baseCategories.add(m.category.toLowerCase());
      }
    });

    const currentVal = this.selectedCategory;
    this.queueCategoryFilter.innerHTML = `
      <option value="all">All Categories</option>
      <option value="image">Images</option>
      <option value="video">Videos</option>
      <option value="gif">GIFs</option>
    `;

    baseCategories.forEach(cat => {
      if (!['all', 'image', 'video', 'gif'].includes(cat)) {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        this.queueCategoryFilter.appendChild(opt);
      }
    });

    this.queueCategoryFilter.value = currentVal;
  }

  /**
   * Helper to detect media format (image, video, gif)
   */
  _detectMediaType(meme) {
    if (meme.mediaType) {
      const type = meme.mediaType.toLowerCase();
      if (type.includes('video') || type === 'mp4' || type === 'webm') return 'video';
      if (type.includes('gif')) return 'gif';
      return 'image';
    }

    const url = (meme.mediaUrl || '').toLowerCase();
    if (url.endsWith('.webm') || url.endsWith('.mp4') || url.endsWith('.ogg')) return 'video';
    if (url.endsWith('.gif')) return 'gif';
    return 'image';
  }

  /**
   * Helper to resolve relative media paths from /admin/ directory
   */
  _resolveMediaUrl(url) {
    if (!url) return '../memes/sample.jpg';
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      return url;
    }
    if (url.startsWith('../')) {
      return url;
    }
    if (url.startsWith('/')) {
      return `..${url}`;
    }
    return `../${url}`;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  _formatRelativeTime(isoString) {
    if (!isoString) return 'recently';
    const time = this._getTimestamp(isoString);
    if (time === 0) return 'recently';

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

  /**
   * View Transitions
   */
  showLoader(show) {
    if (this.loaderEl) {
      this.loaderEl.style.display = show ? 'flex' : 'none';
    }
  }

  showQueueLoading(show) {
    if (this.queueLoadingEl) {
      this.queueLoadingEl.style.display = show ? 'flex' : 'none';
    }
    if (this.queueContainer && show) {
      this.queueContainer.style.opacity = '0.35';
    } else if (this.queueContainer) {
      this.queueContainer.style.opacity = '1';
    }
  }

  showLoginView() {
    this.showLoader(false);
    if (this.loginSectionEl) this.loginSectionEl.style.display = 'flex';
    if (this.dashboardSectionEl) this.dashboardSectionEl.style.display = 'none';
    if (this.userChipEl) this.userChipEl.style.display = 'none';
    this.setSubmitLoading(false);
  }

  showDashboardView(admin) {
    this.showLoader(false);
    if (this.loginSectionEl) this.loginSectionEl.style.display = 'none';
    if (this.dashboardSectionEl) this.dashboardSectionEl.style.display = 'flex';
    if (this.userChipEl) this.userChipEl.style.display = 'flex';

    if (this.headerUsername) this.headerUsername.textContent = admin.displayName;
    if (this.headerRole) this.headerRole.textContent = admin.role;
    if (this.dashAdminName) this.dashAdminName.textContent = admin.displayName;
    if (this.dashAdminRole) this.dashAdminRole.textContent = admin.role;
  }

  showAlert(message) {
    if (this.alertBox && this.alertMsg) {
      this.alertMsg.textContent = message;
      this.alertBox.style.display = 'flex';
    }
  }

  hideAlert() {
    if (this.alertBox) {
      this.alertBox.style.display = 'none';
    }
  }

  setSubmitLoading(isLoading) {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = isLoading;
    this.submitBtn.innerHTML = isLoading
      ? `<span>Authenticating...</span>`
      : `<span class="btn-text">Sign In</span>`;
  }

  /**
   * Standard Toast Notification Dispatcher
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
    } else {
      iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSVG}<span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
}

// Initialize Admin Controller
document.addEventListener('DOMContentLoaded', () => {
  window.adminController = new AdminController();
});
