/**
 * MemeSnip Authentication & User Management Service
 * Pluggable service layer supporting guest mode and user sessions
 */

import {
  auth
} from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Default avatar shown for guests (not logged in)
const GUEST_DEFAULT_AVATAR = "avatars/default-guest.jpg";

// Fallback avatar for logged-in users who haven't uploaded a custom picture yet.
// Matches the same Dicebear convention already used for meme card uploader avatars.
function getFallbackAvatar(displayName) {
  return "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(displayName || "User");
}

class AuthService {
  constructor() {
    this.listeners = [];
    this.currentUser = null;

    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.currentUser = {
          uid: user.uid,
          username: user.displayName || user.email,
          displayName: user.displayName || user.email,
          email: user.email,
          avatarUrl: user.photoURL || getFallbackAvatar(user.displayName || user.email),
          isLoggedIn: true
        };
      } else {
        this.currentUser = {
          username: "Guest",
          displayName: "Guest User",
          email: "",
          avatarUrl: GUEST_DEFAULT_AVATAR,
          isLoggedIn: false
        };
      }

      this._notifyListeners();
    });
  }



  getCurrentUser() {
    return this.currentUser;
  }

  onAuthStateChanged(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
      callback(this.currentUser);
    }
  }

  _notifyListeners() {
    for (const cb of this.listeners) {
      cb(this.currentUser);
    }
  }

  async login(email, password) {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    this.currentUser = {
      uid: credential.user.uid,
      username: credential.user.displayName || credential.user.email,
      displayName: credential.user.displayName || credential.user.email,
      email: credential.user.email,
      avatarUrl: credential.user.photoURL || getFallbackAvatar(credential.user.displayName || credential.user.email),
      isLoggedIn: true
    };

    this._notifyListeners();
    return this.currentUser;
  }

  async register(userData) {
    if (!userData.username || !userData.email || !userData.password) {
      throw new Error("Username, email, and password are required.");
    }

    const credential = await createUserWithEmailAndPassword(
      auth,
      userData.email.trim(),
      userData.password
    );

    await updateProfile(credential.user, {
      displayName: userData.username.trim()
    });

    this.currentUser = {
      uid: credential.user.uid,
      username: userData.username.trim(),
      displayName: userData.username.trim(),
      email: credential.user.email,
      avatarUrl: getFallbackAvatar(userData.username.trim()),
      isLoggedIn: true
    };

    this._notifyListeners();
    return this.currentUser;
  }

  async logout() {
    await signOut(auth);

    this.currentUser = {
      username: "Guest",
      displayName: "Guest User",
      email: "",
      avatarUrl: GUEST_DEFAULT_AVATAR,
      isLoggedIn: false
    };

    this._notifyListeners();
  }

  async updateProfile(updates) {
    if (!this.currentUser.isLoggedIn || !auth.currentUser) return;

    // Persist to Firebase Auth's actual profile fields (displayName / photoURL)
    const authUpdates = {};
    if (updates.displayName !== undefined) authUpdates.displayName = updates.displayName;
    if (updates.avatarUrl !== undefined) authUpdates.photoURL = updates.avatarUrl;

    if (Object.keys(authUpdates).length > 0) {
      await updateProfile(auth.currentUser, authUpdates);
    }

    this.currentUser = { ...this.currentUser, ...updates };
    this._notifyListeners();
    return this.currentUser;
  }
}

// Global Singleton Export
window.authService = new AuthService();

