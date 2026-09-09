/**
 * MemeSnip Meme Management Service
 * Handles CRUD operations, filtering, search, likes, and reliable file downloads
 * Built with async/await interface matching REST / GraphQL API endpoints
 */
import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

class MemeService {
  constructor() {
    this.likedMemeIds = new Set(this._loadLocalLikedIds());
  }

  _loadLocalLikedIds() {
    try {
      const stored = localStorage.getItem('memesnip_user_likes');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  _saveLocalLikedIds() {
    localStorage.setItem('memesnip_user_likes', JSON.stringify([...this.likedMemeIds]));
  }

  hasLiked(memeId) {
    return this.likedMemeIds.has(memeId);
  }

  /**
   * Fetch memes with optional filtering, search query, and sorting
   */
  async getMemes({ category = 'all', searchQuery = '', sortBy = 'newest' } = {}) {
    const snapshot = await getDocs(collection(db, "memes"));

    let memes = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));

    // 1. Category Filter
    if (category && category !== 'all') {
      const targetCat = category.toLowerCase().replace(/['s]/g, ''); // handle "gif's" -> "gif"
      memes = memes.filter(m => {
        const c = m.category.toLowerCase();
        if (targetCat === 'image' || targetCat === 'images') return c === 'image';
        if (targetCat === 'video' || targetCat === 'videos') return c === 'video';
        if (targetCat === 'gif' || targetCat === 'gifs') return c === 'gif';
        return c === targetCat;
      });
    }

    // 2. Search Query Filter
    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      memes = memes.filter(m => {
        const titleMatch = m.title && m.title.toLowerCase().includes(q);
        const uploaderMatch = m.uploader && m.uploader.toLowerCase().includes(q);
        const tagsMatch = m.tags && m.tags.some(t => t.toLowerCase().includes(q));
        return titleMatch || uploaderMatch || tagsMatch;
      });
    }

    // 3. Sorting
    memes.sort((a, b) => {
      if (sortBy === 'likes') {
        return (b.likes || 0) - (a.likes || 0);
      } else if (sortBy === 'downloads') {
        return (b.downloads || 0) - (a.downloads || 0);
      } else {
        // default newest
        return this._getTimestamp(b.createdAt) - this._getTimestamp(a.createdAt);
      }
    });

    return memes;
  }

  /**
   * Helper to normalize timestamp values safely
   */
  _getTimestamp(val) {
    if (!val) return 0;
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return val.seconds * 1000 + (val.nanoseconds || 0) / 1e6;
    }
    if (typeof val?.toDate === 'function') {
      return val.toDate().getTime();
    }
    if (typeof val === 'number') return val;
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Get meme counts per category
   */
  async getCounts() {
    const all = await this.getMemes({ category: 'all' });
    return {
      all: all.length,
      images: all.filter(m => m.category === 'image').length,
      videos: all.filter(m => m.category === 'video').length,
      gifs: all.filter(m => m.category === 'gif').length,
    };
  }

  /**
   * Upload and persist a new meme
   */
  async uploadMeme({ title, category, file, fileDataUrl, tags = [] }) {
    const currentUser = window.authService?.getCurrentUser();

    if (!currentUser || !currentUser.isLoggedIn) {
      throw new Error("Please sign in before uploading.");
    }

    const memeId = 'meme-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    let mediaUrl = '';
    let mediaType = file ? file.type : 'image/png';

    if (file) {
      // POST file binary to PHP upload endpoint on InfinityFree
      const formData = new FormData();
      formData.append('file', file);

      let response;
      try {
        response = await fetch('/api/upload.php', {
          method: 'POST',
          body: formData
        });
      } catch (networkErr) {
        throw new Error("Network error during file upload. Please check your connection.");
      }

      let result;
      try {
        result = await response.json();
      } catch (parseErr) {
        throw new Error(`Upload failed with server status ${response.status}.`);
      }

      if (!response.ok || !result || !result.success || !result.filename) {
        const errorMsg = result?.error || `Upload failed (${response.status}).`;
        throw new Error(errorMsg);
      }

      // Use the verified, sanitized, and collision-free filename returned by the server
      mediaUrl = `memes/${result.filename}`;
    } else if (fileDataUrl && !fileDataUrl.startsWith('data:')) {
      mediaUrl = fileDataUrl.startsWith('memes/') ? fileDataUrl : `memes/${fileDataUrl}`;
    } else {
      mediaUrl = 'memes/speed_face.jpg';
    }

    const newMeme = {
      id: memeId,
      title: title || 'Untitled Snippet',
      category: category || 'image',
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      uploader: currentUser.isLoggedIn ? (currentUser.displayName || currentUser.username) : 'Anonymous',
      uploaderAvatar: currentUser.avatarUrl || 'avatar.jpg',
      likes: 0,
      downloads: 0,
      createdAt: serverTimestamp(),
      tags: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean)
    };

    const docRef = await addDoc(collection(db, "memes"), newMeme);

    newMeme.id = docRef.id;

    return newMeme;
  }

  /**
   * Toggle like on a meme
   */
  async toggleLike(memeId) {
    const hasLiked = this.likedMemeIds.has(memeId);
    const memeRef = doc(db, "memes", memeId);

    if (hasLiked) {
      await updateDoc(memeRef, {
        likes: increment(-1)
      });

      this.likedMemeIds.delete(memeId);
    } else {
      await updateDoc(memeRef, {
        likes: increment(1)
      });

      this.likedMemeIds.add(memeId);
    }

    this._saveLocalLikedIds();

    return {
      hasLiked: !hasLiked
    };
  }

  /**
   * Universal Download Helper
   * Supports Blobs, SVG data URLs, and remote URLs
   */
  async triggerDownload(memeId) {
    const memeRef = doc(db, 'memes', memeId);
    const snap = await getDoc(memeRef);
    if (!snap.exists()) throw new Error('Meme not found');
    const meme = { id: snap.id, ...snap.data() };

    // Increment download counter in Firestore
    try {
      await updateDoc(memeRef, {
        downloads: increment(1)
      });
    } catch (e) {
      console.warn('Could not increment download counter:', e);
    }

    let downloadUrl = meme.mediaUrl;
    let filename = (meme.title || 'memesnip').toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Determine extension
    let ext = '.png';
    if (meme.category === 'video' || (meme.mediaType && meme.mediaType.includes('video'))) {
      ext = meme.mediaType && meme.mediaType.includes('mp4') ? '.mp4' : '.webm';
    } else if (meme.category === 'gif' || (meme.mediaType && meme.mediaType.includes('gif'))) {
      ext = '.gif';
    } else if (meme.mediaType && meme.mediaType.includes('svg')) {
      ext = '.svg';
    } else if (meme.mediaType && meme.mediaType.includes('jpeg')) {
      ext = '.jpg';
    }

    filename += ext;

    // Handle Blob download
    if (meme.mediaBlob) {
      const blobUrl = URL.createObjectURL(meme.mediaBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      return { success: true, filename, count: meme.downloads };
    }

    // For file paths and web URLs, fetch blob to ensure save dialog with custom filename
    try {
      const response = await fetch(downloadUrl);
      if (response.ok) {
        const fileBlob = await response.blob();
        const blobUrl = URL.createObjectURL(fileBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        return { success: true, filename, count: meme.downloads };
      }
    } catch (e) {
      console.warn('Direct blob fetch failed, falling back to direct anchor:', e);
    }

    // Fallback: direct anchor download
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    return { success: true, filename, count: meme.downloads };
  }
}

// Global Singleton Export
window.memeService = new MemeService();
