import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, googleProvider, signInWithPopup, GoogleAuthProvider } from '../firebase';

export default function UserMenu() {
  const { user, logout, linkGoogle } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  async function handleLinkGoogle() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const idToken = await result.user.getIdToken();
      const accessToken = credential?.accessToken || null;
      await linkGoogle(idToken, accessToken);
      setOpen(false);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        return; // User cancelled, do nothing
      }
      alert(err.message || 'Failed to link Google account');
    }
  }

  return (
    <div className="user-menu">
      <button className="user-menu-trigger" onClick={() => setOpen(!open)}>
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="user-avatar" />
        ) : (
          <span className="user-avatar-placeholder">
            {(user.display_name || 'A')[0].toUpperCase()}
          </span>
        )}
        <span className="user-name">{user.display_name}</span>
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-info">
            <span>{user.mobile}</span>
            {user.google_email && <span className="user-google">{user.google_email}</span>}
          </div>
          {!user.google_email && (
            <button className="user-dropdown-btn" onClick={handleLinkGoogle}>
              Link Google Account
            </button>
          )}
          <button className="user-dropdown-btn logout" onClick={() => { logout(); setOpen(false); }}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
