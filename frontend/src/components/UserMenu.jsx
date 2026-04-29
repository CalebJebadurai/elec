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
    <div className="relative">
      <button
        className="flex items-center gap-2 cursor-pointer bg-transparent border-none"
        onClick={() => setOpen(!open)}
        aria-label="User menu"
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-primary-400 text-black text-sm font-semibold flex items-center justify-center">
            {(user.display_name || 'A')[0].toUpperCase()}
          </span>
        )}
        <span className="text-sm text-neutral-200 hidden md:inline">{user.display_name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-neutral-900 border border-neutral-800 rounded-xl p-3 min-w-[200px] shadow-xl z-50">
          <div className="text-xs text-neutral-400 mb-2 space-y-1">
            <span className="block">{user.mobile}</span>
            {user.google_email && (
              <span className="block text-primary-300">{user.google_email}</span>
            )}
          </div>
          {!user.google_email && (
            <button
              className="w-full text-left text-xs text-neutral-200 px-2 py-2 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              onClick={handleLinkGoogle}
            >
              Link Google Account
            </button>
          )}
          <button
            className="w-full text-left text-xs text-error px-2 py-2 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            onClick={() => {
              logout();
              setOpen(false);
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
