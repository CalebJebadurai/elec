import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function UserMenu() {
  const { user, logout, linkGoogle } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  async function handleLinkGoogle() {
    try {
      // Google Sign-In integration
      if (!window.google) {
        alert('Google Sign-In not configured');
        return;
      }
      // Trigger Google One Tap or popup flow
      // This is handled by the Google Identity Services library
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        callback: async (response) => {
          if (response.access_token) {
            await linkGoogle(response.access_token);
            setOpen(false);
          }
        },
      });
      client.requestAccessToken();
    } catch (err) {
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
