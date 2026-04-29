import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  googleProvider,
  signInWithPopup,
  GoogleAuthProvider,
} from '../firebase';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from './ui/dialog';

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

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { login, linkGoogle } = useAuth();
  const [mobile, setMobile] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [step, setStep] = useState<'phone' | 'otp' | 'google' | 'done'>('phone');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const recaptchaRef = useRef<ReturnType<typeof RecaptchaVerifier> | null>(null);
  const confirmationResultRef = useRef<{
    confirm: (code: string) => Promise<{ user: { getIdToken: () => Promise<string> } }>;
  } | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    setOtp((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !otp[index] && index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    },
    [otp]
  );

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = pasted.split('');
    setOtp((prev) => {
      const next = [...prev];
      digits.forEach((d, i) => {
        next[i] = d;
      });
      return next;
    });
    const focusIdx = Math.min(digits.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }, []);

  function getOrCreateRecaptcha() {
    if (recaptchaRef.current) {
      try {
        recaptchaRef.current.clear();
      } catch {
        /* recaptcha already cleared */
      }
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

  async function handleSendOtp(e: React.FormEvent) {
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
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const otpCode = otp.join('');
      const result = await confirmationResultRef.current!.confirm(otpCode);
      const idToken = await result.user.getIdToken();
      const fullMobile = `${countryCode}${mobile.replace(/[\s\-()]/g, '')}`;
      const user = await login(fullMobile, idToken);
      if (user.google_email) {
        onOpenChange(false);
      } else {
        setStep('google');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Invalid OTP');
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
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg?.includes('popup-closed')) {
        setError('Google sign-in was cancelled. Please try again.');
      } else {
        setError(msg || 'Failed to link Google account');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent open={open}>
        <DialogClose className="absolute right-4 top-4 rounded-sm text-neutral-400 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-primary-400 focus-visible:outline-offset-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogTitle className="text-xl font-semibold text-white mb-1">Sign In</DialogTitle>
        <DialogDescription className="text-sm text-neutral-400 mb-4">
          {step === 'google'
            ? 'Link your Google account to continue'
            : 'Sign in with your mobile number to save predictions'}
        </DialogDescription>

        {error && (
          <div className="mb-4 rounded-lg bg-error-muted/50 border border-error/30 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">
              Mobile Number
            </label>
            <div className="flex gap-2 mb-3">
              <select
                className="w-[110px] rounded-md border border-neutral-800 bg-[#1e1e1e] px-2 py-2 text-sm text-neutral-200 focus:outline-2 focus:outline-primary-400"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.short} value={c.code}>
                    {c.flag} {c.short} ({c.code})
                  </option>
                ))}
              </select>
              <input
                type="tel"
                className="flex-1 rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400"
                placeholder="98765 43210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div id="recaptcha-container" />
            <label className="flex items-start gap-2 text-xs text-neutral-400 my-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I agree to the{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:underline"
                >
                  Privacy Policy
                </a>{' '}
                and{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:underline"
                >
                  Terms of Service
                </a>
              </span>
            </label>
            <button
              type="submit"
              className="w-full mt-2 rounded-lg bg-primary-400 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-primary-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              disabled={loading || !consent}
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Enter OTP sent to {countryCode} {mobile}
            </label>
            <div className="flex justify-center gap-2 mb-4" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  className="w-10 h-12 rounded-lg border border-neutral-800 bg-[#1e1e1e] text-center text-lg text-white focus:outline-2 focus:outline-primary-400"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-primary-400 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-primary-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              disabled={loading || otp.join('').length < 6}
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </form>
        )}

        {step === 'google' && (
          <div>
            <p className="text-sm text-neutral-300 mb-4">
              Phone verified! Link your Google account for a richer experience.
            </p>
            <button
              type="button"
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-50 min-h-[44px] mb-2"
              onClick={handleGoogleLink}
              disabled={loading}
            >
              {loading ? 'Linking...' : 'Sign in with Google'}
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-neutral-800 bg-transparent px-4 py-2.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 min-h-[44px]"
              onClick={() => onOpenChange(false)}
            >
              Skip for now
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
