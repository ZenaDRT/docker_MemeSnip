/**
 * MemeSnip Main Application Controller
 * Orchestrates events, routing, search, uploads, and interactions
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 MemeSnip Initializing...');

  // Initialize Auth state listener
  window.authService.onAuthStateChanged(user => {
    updateAuthUI(user);
  });

  // Initial Meme Grid Render
  await window.ui.renderMemes();

  handleShareLinkRouting();

  initNavigationEvents();
  initSearchEvents();
  initCardActionDelegation();
  initUploadModalEvents();
  initAuthModalEvents();
  initProfileDropdown();
  initUploaderFilterEvents();
  initAvatarUploadEvents();
});

/**
 * Navigation & Filter Pill Events
 */
function initNavigationEvents() {
  const filterPills = document.querySelectorAll('.filter-pill[data-filter]');

  filterPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();

      // Pause any active video
      window.videoPlayer.pauseAll();

      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filterValue = pill.dataset.filter;
      window.ui.currentFilter = filterValue;
      window.ui.renderMemes();
    });
  });

  // Upload pill button in filter bar
  const pillUpload = document.getElementById('pillUpload');
  if (pillUpload) {
    pillUpload.addEventListener('click', () => {
      window.ui.openModal('uploadModal');
    });
  }

  // About pill button in filter bar
  const pillAbout = document.getElementById('pillAbout');
  if (pillAbout) {
    pillAbout.addEventListener('click', () => {
      window.ui.openModal('aboutModal');
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      window.ui.currentSort = e.target.value;
      window.ui.renderMemes();
    });
  }
}

/**
 * Live Search Events (Debounced)
 */
function initSearchEvents() {
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  let debounceTimeout = null;

  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (searchClear) {
      searchClear.style.display = val.length > 0 ? 'flex' : 'none';
    }

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      window.ui.currentSearch = val;
      window.ui.renderMemes();
    }, 250);
  });

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      window.ui.currentSearch = '';
      window.ui.renderMemes();
      searchInput.focus();
    });
  }
}

function handleShareLinkRouting() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#meme-')) return;

  const memeId = hash.slice('#meme-'.length);
  if (!memeId) return;

  const card = document.querySelector(`.meme-card[data-id="${CSS.escape(memeId)}"]`);
  if (!card) {
    console.warn('Shared meme not found:', memeId);
    return;
  }

  window.ui.openMediaPreviewModal(card, memeId);
}

/**
 * Card Action Delegation (Likes, Downloads, Share)
 */
function initCardActionDelegation() {
  const memeGrid = document.getElementById('memeGrid');
  if (!memeGrid) return;

  memeGrid.addEventListener('click', async (e) => {
    const target = e.target;

    // 1. Download Button Click
    const downloadBtn = target.closest('[data-action="download"]');
    if (downloadBtn) {
      e.stopPropagation();
      const memeId = downloadBtn.dataset.id;

      // Visual click feedback
      downloadBtn.style.transform = 'scale(0.95)';
      setTimeout(() => downloadBtn.style.transform = '', 150);

      try {
        window.ui.showToast('Preparing download...', 'info', 1500);
        const res = await window.memeService.triggerDownload(memeId);
        window.ui.showToast(`Saved "${res.filename}" successfully! 🚀`, 'success');
      } catch (err) {
        console.error('Download error:', err);
        window.ui.showToast('Could not download meme. Please try again.', 'error');
      }
      return;
    }

    // 2. Like Button Click
    const likeBtn = target.closest('[data-action="like"]');
    if (likeBtn) {
      e.stopPropagation();
      if (likeBtn.disabled) return; // ignore rapid double-clicks while a request is in flight
      likeBtn.disabled = true;
      const memeId = likeBtn.dataset.id;
      try {
        const res = await window.memeService.toggleLike(memeId);
        if (res) {
          const countSpan = likeBtn.querySelector('.like-count');
          if (countSpan) {
            const current = parseInt(countSpan.textContent, 10) || 0;
            countSpan.textContent = Math.max(0, current + (res.hasLiked ? 1 : -1));
          }

          if (res.hasLiked) {
            likeBtn.classList.add('liked');
            likeBtn.title = 'Unlike';
            window.ui.showToast('Added to your liked memes! ❤️', 'success', 2000);
          } else {
            likeBtn.classList.remove('liked');
            likeBtn.title = 'Like';
          }
        }
      } catch (err) {
        console.error('Like error:', err);
      } finally {
        likeBtn.disabled = false;
      }
      return;
    }

    // 3. Share Button Click
    const shareBtn = target.closest('[data-action="share"]');
    if (shareBtn) {
      e.stopPropagation();
      const memeId = shareBtn.dataset.id;
      const shareUrl = `${window.location.origin}${window.location.pathname}#meme-${memeId}`;

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        window.ui.showToast('Meme link copied to clipboard! 📋', 'success');
      } else {
        window.ui.showToast(`Meme ID: ${memeId}`, 'info');
      }
      return;
    }
  });
}

/**
 * Upload Modal & File Drag-and-Drop
 */
function initUploadModalEvents() {
  const dropzone = document.getElementById('uploadDropzone');
  const fileInput = document.getElementById('fileInput');
  const previewContainer = document.getElementById('uploadPreviewContainer');
  const previewMedia = document.getElementById('uploadPreviewMedia');
  const removePreviewBtn = document.getElementById('btnRemovePreview');
  const uploadForm = document.getElementById('uploadMemeForm');
  const categoryRadios = document.querySelectorAll('.category-radio-btn');

  let selectedFile = null;
  let currentPreviewUrl = null;

  if (!dropzone || !fileInput || !previewContainer) return;

  function clearMediaPreview() {
    selectedFile = null;
    fileInput.value = '';

    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }

    if (previewMedia) {
      previewMedia.innerHTML = '';
    } else {
      const existingMedia = previewContainer.querySelectorAll('.upload-preview-media');
      existingMedia.forEach(el => el.remove());
    }

    previewContainer.classList.remove('active');
    dropzone.style.display = 'flex';
  }

  // Remove preview button
  if (removePreviewBtn) {
    removePreviewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearMediaPreview();
    });
  }

  // Dropzone drag-and-drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (!file) return;

    // Clean up previous preview URL
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }

    selectedFile = file;
    const fileType = file.type;

    // Auto select matching category
    let detectedCat = 'image';
    if (fileType.includes('video')) detectedCat = 'video';
    else if (fileType.includes('gif')) detectedCat = 'gif';

    categoryRadios.forEach(btn => {
      const input = btn.querySelector('input');
      if (input.value === detectedCat) {
        btn.classList.add('selected');
        input.checked = true;
      } else {
        btn.classList.remove('selected');
      }
    });

    // Generate preview
    currentPreviewUrl = URL.createObjectURL(file);
    const targetParent = previewMedia || previewContainer;
    targetParent.innerHTML = '';

    if (fileType.includes('video')) {
      const vid = document.createElement('video');
      vid.src = currentPreviewUrl;
      vid.controls = true;
      vid.className = 'upload-preview-media';
      targetParent.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = currentPreviewUrl;
      img.className = 'upload-preview-media';
      targetParent.appendChild(img);
    }

    previewContainer.classList.add('active');
    dropzone.style.display = 'none';
  }

  // Category radio selector pills
  categoryRadios.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryRadios.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      btn.querySelector('input').checked = true;
    });
  });

  // Submit Upload
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleInput = document.getElementById('memeTitleInput');
      const tagsInput = document.getElementById('memeTagsInput');
      const selectedCategoryInput = document.querySelector('input[name="memeCategory"]:checked');

      const title = titleInput ? titleInput.value.trim() : '';
      const category = selectedCategoryInput ? selectedCategoryInput.value : 'image';
      const tags = tagsInput ? tagsInput.value.trim() : '';

      if (!title) {
        window.ui.showToast('Please enter a title for your meme.', 'warning');
        return;
      }

      if (!selectedFile) {
        window.ui.showToast('Please select an image, GIF, or video to upload.', 'warning');
        return;
      }

      const submitBtn = uploadForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Uploading...</span>`;
      }

      try {
        await window.memeService.uploadMeme({
          title,
          category,
          file: selectedFile,
          tags
        });

        window.ui.showToast('Meme uploaded successfully! 🎉', 'success');
        window.ui.closeModal('uploadModal');

        // Reset form & preview
        uploadForm.reset();
        clearMediaPreview();

        // Re-render grid
        await window.ui.renderMemes();

      } catch (err) {
        console.error('Upload failed:', err);
        window.ui.showToast(err.message || 'Failed to upload meme. Please try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Publish Meme</span>`;
        }
      }
    });
  }
}

/**
 * Profile Dropdown & Modal Triggers
 */
function initProfileDropdown() {
  const avatarBtn = document.getElementById('avatarBtn');
  const profileDropdown = document.getElementById('profileDropdown');

  if (!avatarBtn || !profileDropdown) return;

  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('show');
    avatarBtn.classList.toggle('active');
  });

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target) && !avatarBtn.contains(e.target)) {
      profileDropdown.classList.remove('show');
      avatarBtn.classList.remove('active');
    }
  });

  // Dropdown Item: Profile
  const itemProfile = document.getElementById('dropdownItemProfile');
  if (itemProfile) {
    itemProfile.addEventListener('click', () => {
      profileDropdown.classList.remove('show');
      populateProfileModal();
      window.ui.openModal('profileModal');
    });
  }

  // Dropdown Item: About
  const itemAbout = document.getElementById('dropdownItemAbout');
  if (itemAbout) {
    itemAbout.addEventListener('click', () => {
      profileDropdown.classList.remove('show');
      window.ui.openModal('aboutModal');
    });
  }

  // Dropdown Item: Sign Out / Sign In
  const itemAuthAction = document.getElementById('dropdownItemAuthAction');
  if (itemAuthAction) {
    itemAuthAction.addEventListener('click', () => {
      profileDropdown.classList.remove('show');
      const currentUser = window.authService.getCurrentUser();
      if (currentUser.isLoggedIn) {
        window.authService.logout();
        window.ui.showToast('Signed out successfully.', 'info');
      } else {
        window.ui.openModal('authModal');
      }
    });
  }

  // Header login button (when guest)
  const headerLoginBtn = document.getElementById('headerLoginBtn');
  if (headerLoginBtn) {
    headerLoginBtn.addEventListener('click', () => {
      window.ui.openModal('authModal');
    });
  }
}

/**
 * Authentication Modal Handlers
 */
function initAuthModalEvents() {
  const authTabs = document.querySelectorAll('.auth-tab-btn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  let selectedAvatar = 'avatar.jpg';

  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      authTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.dataset.mode;
      if (mode === 'login') {
        if (loginForm) loginForm.style.display = 'flex';
        if (registerForm) registerForm.style.display = 'none';
      } else {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'flex';
      }
    });
  });

  // Avatar Selection
  const avatarOptions = document.querySelectorAll('.avatar-option');
  avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const img = opt.querySelector('img');
      if (img) selectedAvatar = img.src;
    });
  });

  // Login Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('loginUsername');
      const passwordInput = document.getElementById('loginPassword');
      let val = usernameInput ? usernameInput.value.trim() : '';
      const pass = passwordInput ? passwordInput.value : '';

      try {
        await window.authService.login(val, pass);
        window.ui.showToast(`Welcome back! 🔥`, 'success');
        window.ui.closeModal('authModal');
      } catch (err) {
        window.ui.showToast(err.message, 'error');
      }
    });
  }

  // Register Submit
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('regUsername');
      const emailInput = document.getElementById('regEmail');
      const passwordInput = document.getElementById('regPassword');

      const username = usernameInput ? usernameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      try {
        await window.authService.register({
          username,
          email,
          password
        });
        window.ui.showToast(`Welcome aboard, ${username}! 🚀`, 'success');
        window.ui.closeModal('authModal');
      } catch (err) {
        window.ui.showToast(err.message, 'error');
      }
    });
  }
}

/**
 * Update UI for current User State
 */
function updateAuthUI(user) {
  const avatarImg = document.getElementById('headerAvatarImg');
  const dropdownUsername = document.getElementById('dropdownUsername');
  const dropdownRole = document.getElementById('dropdownRole');
  const authActionText = document.getElementById('authActionText');

  if (avatarImg && user && user.avatarUrl) avatarImg.src = user.avatarUrl;

  if (user && user.isLoggedIn) {
    if (dropdownUsername) dropdownUsername.textContent = user.displayName;
    if (dropdownRole) dropdownRole.textContent = 'Active Creator';
    if (authActionText) authActionText.textContent = 'Sign Out';
  } else {
    if (dropdownUsername) dropdownUsername.textContent = 'Guest User';
    if (dropdownRole) dropdownRole.textContent = 'Browsing Mode';
    if (authActionText) authActionText.textContent = 'Sign In';
  }
}

async function populateProfileModal() {
  const user = window.authService.getCurrentUser();

  const profName = document.getElementById("profileModalName");
  const profEmail = document.getElementById("profileModalEmail");
  const profAvatar = document.getElementById("profileModalAvatar");

  const statUploads = document.getElementById("profileStatUploads");
  const statLikes = document.getElementById("profileStatLikes");
  const statDownloads = document.getElementById("profileStatDownloads");

  // Existing profile info
  if (profName) profName.textContent = user.displayName;
  if (profEmail) profEmail.textContent = user.email || "guest@memesnip.io";
  if (profAvatar && user.avatarUrl) profAvatar.src = user.avatarUrl;

  const changeAvatarBtn = document.getElementById("changeAvatarBtn");
  if (changeAvatarBtn) {
    changeAvatarBtn.style.display = user.isLoggedIn ? "flex" : "none";
  }

  // Guest users: show zero stats
  if (!user.isLoggedIn) {
    if (statUploads) statUploads.textContent = "0";
    if (statLikes) statLikes.textContent = "0";
    if (statDownloads) statDownloads.textContent = "0";
    return;
  }

  try {
    const allMemes = await window.memeService.getMemes({ category: "all" });

    const userMemes = allMemes.filter(
      (meme) => meme.uploader === user.displayName
    );

    const uploads = userMemes.length;

    const likes = userMemes.reduce(
      (total, meme) => total + (meme.likes || 0),
      0
    );

    const downloads = userMemes.reduce(
      (total, meme) => total + (meme.downloads || 0),
      0
    );

    if (statUploads) statUploads.textContent = uploads;
    if (statLikes) statLikes.textContent = likes;
    if (statDownloads) statDownloads.textContent = downloads;
  } catch (error) {
    console.error("Failed to load profile stats:", error);

    if (statUploads) statUploads.textContent = "0";
    if (statLikes) statLikes.textContent = "0";
    if (statDownloads) statDownloads.textContent = "0";
  }
}

/**
 * "My Uploads" Filter Events (Uploads stat in Profile modal + banner Clear button)
 */
function initUploaderFilterEvents() {
  const uploadsBox = document.getElementById('profileStatUploadsBox');
  if (uploadsBox) {
    const triggerFilter = () => {
      const user = window.authService.getCurrentUser();
      if (!user || !user.isLoggedIn) return;
      window.ui.showMyUploads(user.displayName);
    };

    uploadsBox.addEventListener('click', triggerFilter);
    uploadsBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerFilter();
      }
    });
  }

  const clearBtn = document.getElementById('uploaderFilterBannerClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => window.ui.clearUploaderFilter());
  }
}

/**
 * Profile Picture Upload (Change Avatar button in Profile modal)
 */
function initAvatarUploadEvents() {
  const changeBtn = document.getElementById('changeAvatarBtn');
  const fileInput = document.getElementById('avatarUploadInput');
  if (!changeBtn || !fileInput) return;

  changeBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    const user = window.authService.getCurrentUser();
    if (!user || !user.isLoggedIn) {
      window.ui.showToast('Sign in to change your profile picture.', 'error');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      window.ui.showToast('Please choose a JPG, PNG, WEBP, or GIF image.', 'error');
      return;
    }

    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      window.ui.showToast('Image must be under 5MB.', 'error');
      return;
    }

    window.ui.showToast('Uploading profile picture...', 'info');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('api/upload_avatar.php', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed.');
      }

      const newAvatarUrl = `avatars/${result.filename}`;
      await window.authService.updateProfile({ avatarUrl: newAvatarUrl });

      const profAvatar = document.getElementById('profileModalAvatar');
      if (profAvatar) profAvatar.src = newAvatarUrl;

      const headerAvatar = document.getElementById('headerAvatarImg');
      if (headerAvatar) headerAvatar.src = newAvatarUrl;

      window.ui.showToast('Profile picture updated! 🎉', 'success');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      window.ui.showToast(err.message || 'Failed to update profile picture.', 'error');
    }
  });
}

// Global modal close handlers
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.ui.closeAllModals();
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) profileDropdown.classList.remove('show');
  }
});
