import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, RecaptchaVerifier, signInWithPhoneNumber, googleProvider, signInWithPopup, GoogleAuthProvider } from '../firebase';

const COUNTRY_CODES = [
  { flag: '🇮🇳', code: '+91', short: 'IN' },
  { flag: '🇺🇸', code: '+1', short: 'US' },
  { flag: '🇬🇧', code: '+44', short: 'GB' },
  { flag: '🇦🇪', code: '+971', short: 'AE' },
  { flag: '🇸🇬', code: '+65', short: 'SG' },
  { flag: '🇦🇺', code: '+61', short: 'AU' },
  { flag: '🇨🇦', code: '+1', short: 'CA' },
  { flag: '🇩🇪', code: '+49', short: 'DE' },
  { flag: '🇫🇷', code: '+33', short: 'FR' },
  { flag: '🇯🇵', code: '+81', short: 'JP' },
  { flag: '🇰🇷', code: '+82', short: 'KR' },
  { flag: '🇧🇷', code: '+55', short: 'BR' },
  { flag: '🇿🇦', code: '+27', short: 'ZA' },
  { flag: '🇲🇾', code: '+60', short: 'MY' },
  { flag: '🇳🇬', code: '+234', short: 'NG' },
  { flag: '🇰🇪', code: '+254', short: 'KE' },
  { flag: '🇵🇭', code: '+63', short: 'PH' },
  { flag: '🇮🇩', code: '+62', short: 'ID' },
  { flag: '🇧🇩', code: '+880', short: 'BD' },
  { flag: '🇵🇰', code: '+92', short: 'PK' },
  { flag: '🇱🇰', code: '+94', short: 'LK' },
  { flag: '🇳🇵', code: '+977', short: 'NP' },
  { flag: '🇶🇦', code: '+974', short: 'QA' },
  { flag: '🇰🇼', code: '+965', short: 'KW' },
  { flag: '🇴🇲', code: '+968', short: 'OM' },
  { flag: '🇸🇦', code: '+966', short: 'SA' },
  { flag: '🇳🇿', code: '+64', short: 'NZ' },
];

export default function LoginModal({ onClose, initialStep = 'phone' }) {
  const { login, linkGoogle } = useAuth();
  const [mobile, setMobile] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [step, setStep] = useState(initialStep); // phone | otp | google | done
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const recaptchaRef = useRef(null);
  const confirmationResultRef = useRef(null);
  const otpRefs = useRef([]);

  const handleOtpChange = useCallback((index, value) => {
    if (!/^\d?$/.test(value)) return;
    setOtp(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }, [otp]);

  const handleOtpPaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = pasted.split('');
    setOtp(prev => {
      const next = [...prev];
      digits.forEach((d, i) => { next[i] = d; });
      return next;
    });
    const focusIdx = Math.min(digits.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }, []);

  function getOrCreateRecaptcha() {
    // Clear any previous instance
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch (_) {}
      recaptchaRef.current = null;
    }
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        recaptchaRef.current = null;
      },
    });
    return recaptchaRef.current;
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!auth) {
        setError('Firebase not configured. Set VITE_FIREBASE_API_KEY in .env');
        setLoading(false);
        return;
      }

      const cleaned = mobile.replace(/[\s\-()]/g, '');
      const phoneNumber = `${countryCode}${cleaned}`;

      const verifier = getOrCreateRecaptcha();
      await verifier.render();
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      confirmationResultRef.current = result;
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const otpCode = otp.join('');
      const result = await confirmationResultRef.current.confirm(otpCode);
      const idToken = await result.user.getIdToken();
      const fullMobile = `${countryCode}${mobile.replace(/[\s\-()]/g, '')}`;
      const user = await login(fullMobile, idToken);
      // If Google is already linked, we're done
      if (user.google_email) {
        onClose();
      } else {
        setStep('google');
      }
    } catch (err) {
      setError(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLink() {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const idToken = await result.user.getIdToken();
      const accessToken = credential?.accessToken || null;
      await linkGoogle(idToken, accessToken);
      onClose();
    } catch (err) {
      if (err.message?.includes('popup-closed')) {
        setError('Google sign-in was cancelled. Please try again.');
      } else {
        setError(err.message || 'Failed to link Google account');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Sign In</h2>
        <p className="modal-subtitle">
          {step === 'google'
            ? 'Link your Google account to continue'
            : 'Sign in with your mobile number to save predictions'}
        </p>

        {error && <div className="modal-error">{error}</div>}

        {step === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <label className="modal-label">Mobile Number</label>
            <div className="phone-input-row">
              <select
                className="country-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.short} value={c.code}>
                    {c.flag} {c.short} ({c.code})
                  </option>
                ))}
              </select>
              <input
                type="tel"
                className="modal-input phone-number-input"
                placeholder="98765 43210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div id="recaptcha-container" />
            <button type="submit" className="modal-btn" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <label className="modal-label">Enter OTP sent to {countryCode} {mobile}</label>
            <div className="otp-boxes" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  className="otp-box"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button type="submit" className="modal-btn" disabled={loading || otp.join('').length < 6}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </form>
        )}

        {step === 'google' && (
          <div>
            <p className="modal-label">Phone verified! Now link your Google account for full access.</p>
            <button
              type="button"
              className="modal-btn modal-btn-google"
              onClick={handleGoogleLink}
              disabled={loading}
            >
              {loading ? 'Linking...' : 'Sign in with Google'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
