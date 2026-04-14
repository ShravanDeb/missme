import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { doc, onSnapshot } from "firebase/firestore";
import { db, requestReceiverNotifications, subscribeForegroundNotifications } from "@/lib/firebaseClient";

type RoomState = {
  taps: number;
  exists: boolean;
  loading: boolean;
};

type ApiErrorContext = {
  fallbackMessage: string;
  status?: number;
};

async function readApiError(response: Response, context: ApiErrorContext): Promise<string> {
  let payloadMessage = "";
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    payloadMessage = payload.error ?? payload.message ?? "";
  } catch { /* ignore */ }

  if (payloadMessage) return payloadMessage;
  const status = context.status ?? response.status;
  if (status === 404) return "Create room API was not found (404). If you are running Vite locally, start Vercel functions too.";
  if (status >= 500) return `${context.fallbackMessage} (server error ${status}).`;
  return `${context.fallbackMessage} (status ${status}).`;
}

function useRoom(roomId?: string): RoomState {
  const [state, setState] = useState<RoomState>({ taps: 0, exists: true, loading: true });

  useEffect(() => {
    if (!roomId) { setState({ taps: 0, exists: false, loading: false }); return; }
    const roomRef = doc(db, "rooms", roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (!snapshot.exists()) { setState({ taps: 0, exists: false, loading: false }); return; }
      const data = snapshot.data() as { taps?: number };
      setState({ taps: data.taps ?? 0, exists: true, loading: false });
    }, () => { setState((prev) => ({ ...prev, loading: false })); });
    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let disposed = false;
    const pollRoomState = async () => {
      try {
        const response = await fetch(`/api/room-state?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { exists?: boolean; taps?: number };
        if (disposed) return;
        setState((prev) => {
          if (!payload.exists) { if (!prev.exists && !prev.loading) return prev; return { taps: 0, exists: false, loading: false }; }
          const remoteTaps = typeof payload.taps === "number" ? payload.taps : 0;
          const nextTaps = Math.max(prev.taps, remoteTaps);
          if (nextTaps === prev.taps && prev.exists && !prev.loading) return prev;
          return { taps: nextTaps, exists: true, loading: false };
        });
      } catch { /* ignore */ }
    };
    void pollRoomState();
    const timer = window.setInterval(() => { if (document.visibilityState !== "visible") return; void pollRoomState(); }, 800);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [roomId]);

  return state;
}

/* ── Floating background hearts decoration ── */
function FloatingHearts() {
  const hearts = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: 5 + (i * 8.3) % 92,
    delay: (i * 0.7) % 6,
    duration: 8 + (i * 1.3) % 8,
    size: 10 + (i * 3) % 16,
    opacity: 0.04 + (i % 4) * 0.02,
  })), []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}>
      {hearts.map((h) => (
        <span
          key={h.id}
          style={{
            position: "absolute",
            left: `${h.x}%`,
            bottom: "-60px",
            fontSize: `${h.size}px`,
            opacity: h.opacity,
            animation: `bg-float ${h.duration}s ${h.delay}s ease-in-out infinite`,
          }}
        >
          ♥
        </span>
      ))}
      <style>{`
        @keyframes bg-float {
          0%   { transform: translateY(0) rotate(-8deg); opacity: var(--op, 0.06); }
          50%  { transform: translateY(-45vh) rotate(8deg) scale(0.9); }
          100% { transform: translateY(-100vh) rotate(-5deg) scale(0.7); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ── Decorative ring around tap button ── */
function TapRing({ active }: { active: boolean }) {
  return (
    <div style={{
      position: "absolute",
      inset: "-18px",
      borderRadius: "50%",
      border: `1px solid rgba(255,107,157,${active ? 0.5 : 0.15})`,
      boxShadow: active ? "0 0 28px rgba(255,45,107,0.3)" : "none",
      transition: "all 0.35s ease",
      pointerEvents: "none",
    }} />
  );
}

function TapRing2({ active }: { active: boolean }) {
  return (
    <div style={{
      position: "absolute",
      inset: "-32px",
      borderRadius: "50%",
      border: `1px solid rgba(255,107,157,${active ? 0.2 : 0.06})`,
      transition: "all 0.5s ease",
      pointerEvents: "none",
    }} />
  );
}

/* ─────────────────────── HOME PAGE ─────────────────────────────────── */
function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createBond = async () => {
    try {
      setLoading(true); setError("");
      const response = await fetch("/api/create-room", { method: "POST" });
      if (!response.ok) { const msg = await readApiError(response, { fallbackMessage: "Could not create a bond right now" }); throw new Error(msg); }
      const data = (await response.json()) as { roomId: string };
      navigate(`/share/${data.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  };

  return (
    <main className="send-romance-shell">
      <FloatingHearts />
      <section className="send-romance-card">
        <p className="send-eyebrow">a little something for you</p>

        <h1 className="send-title">
          Tap When You
          <br />
          <em>Miss Me</em>
        </h1>

        <p className="send-subtitle">
          Every tap travels instantly across the distance —<br />
          a quiet whisper that says <em style={{ color: "rgba(255,179,204,0.8)", fontStyle: "italic" }}>I'm thinking of you.</em>
        </p>

        {/* Decorative hearts row */}
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "32px", opacity: 0.5 }}>
          {["♥", "✦", "♥", "✦", "♥"].map((s, i) => (
            <span key={i} style={{
              color: i % 2 === 0 ? "#ff6b9d" : "#f5c882",
              fontSize: i === 2 ? "18px" : "11px",
              lineHeight: 1,
              alignSelf: "center",
            }}>{s}</span>
          ))}
        </div>

        <button type="button" onClick={createBond} disabled={loading} className="send-create-btn">
          {loading ? "weaving your bond…" : "✦ create your private bond"}
        </button>

        {error ? <p className="text-danger-token mt-4 text-sm">{error}</p> : null}

        {/* Decorative bottom divider */}
        <div style={{
          marginTop: "36px",
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(255,107,157,0.3), transparent)",
        }} />
        <p style={{ marginTop: "20px", color: "rgba(255,200,220,0.35)", fontSize: "12px", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", letterSpacing: "0.08em" }}>
          private · real-time · just for two
        </p>
      </section>

      <Link to="/reward" className="reward-float-cta" aria-label="Open reward page">
        <span>✨ Want to give me a reward?</span>
      </Link>

      <p className="send-quote">"distance means so little when someone means so much"</p>
    </main>
  );
}

/* ─────────────────────── SHARE PAGE ────────────────────────────────── */
function SharePage() {
  const { roomId = "" } = useParams();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const sendLink = `${origin}/send/${roomId}`;
  const receiveLink = `${origin}/receive/${roomId}`;
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");

  const copyToClipboard = async (value: string, key: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(key); setCopyError("");
      window.setTimeout(() => setCopied(""), 1400);
    } catch { setCopyError("Copy failed. Please copy the link manually."); }
  };

  if (!roomId) return <Navigate to="/" replace />;

  return (
    <main className="send-romance-shell">
      <FloatingHearts />
      <section className="share-card">
        <p className="send-eyebrow">✦ your bond is ready</p>
        <h1 className="send-title" style={{ fontSize: "clamp(28px,5vw,38px)" }}>Your Private Room Is Live</h1>
        <p className="share-subtitle">
          Share one link, keep one link — every tap travels between them in real time.
        </p>

        <div className="share-grid">
          {/* Sender card */}
          <section className="share-link-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "16px" }}>💗</span>
              <p className="share-link-label" style={{ margin: 0 }}>Sender — the one who taps</p>
            </div>
            <p className="share-link-value">{sendLink}</p>
            <div className="share-actions">
              <button type="button" onClick={() => copyToClipboard(sendLink, "send")} className="share-action-btn">
                {copied === "send" ? "✓ Copied!" : "Copy Link"}
              </button>
              <Link to={`/send/${roomId}`} className="share-open-btn">Open Sender</Link>
            </div>
          </section>

          {/* Arrow connector */}
          <div style={{ textAlign: "center", color: "rgba(255,107,157,0.4)", fontSize: "18px", margin: "-4px 0" }}>♥</div>

          {/* Receiver card */}
          <section className="share-link-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "16px" }}>🌸</span>
              <p className="share-link-label" style={{ margin: 0 }}>Receiver — the one who feels</p>
            </div>
            <p className="share-link-value">{receiveLink}</p>
            <div className="share-actions">
              <button type="button" onClick={() => copyToClipboard(receiveLink, "receive")} className="share-action-btn">
                {copied === "receive" ? "✓ Copied!" : "Copy Link"}
              </button>
              <Link to={`/receive/${roomId}`} className="share-open-btn">Open Receiver</Link>
            </div>
          </section>
        </div>

        {copyError ? <p className="text-danger-token mt-4 text-center text-sm">{copyError}</p> : null}

        <div style={{ marginTop: "28px", textAlign: "center" }}>
          <Link to="/" className="share-home-btn">✦ Create Another Room</Link>
        </div>
      </section>
    </main>
  );
}

/* ─────────────────────── SEND PAGE ─────────────────────────────────── */
function SendPage() {
  const { roomId = "" } = useParams();
  const { taps, exists, loading } = useRoom(roomId);
  const [localTapCount, setLocalTapCount] = useState<number | null>(null);
  const [isTapped, setIsTapped] = useState(false);
  const [isBumped, setIsBumped] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; symbol: string; size: number; rot: number; rot2: number; duration: number }>>([]);
  const [error, setError] = useState("");

  const displayedTaps = localTapCount ?? taps;
  const label = useMemo(() => displayedTaps.toLocaleString(), [displayedTaps]);
  const countLabel = "times you've missed them";
  const hearts = ["❤️", "🌸", "💗", "🌷", "💕", "✨", "🩷", "💖"];

  useEffect(() => { setLocalTapCount(taps); }, [taps, roomId]);

  const spawnParticles = (x: number, y: number) => {
    const total = 5 + Math.floor(Math.random() * 4);
    const created = Array.from({ length: total }, (_, index) => {
      const id = Date.now() + index;
      const spread = (Math.random() - 0.5) * 110;
      return { id, x: x + spread, y: y - 10, symbol: hearts[Math.floor(Math.random() * hearts.length)], size: 14 + Math.random() * 18, rot: Math.random() * 30 - 15, rot2: Math.random() * 60 - 30, duration: 1.1 + Math.random() * 0.7 };
    });
    setParticles((prev) => [...prev, ...created]);
    created.forEach((p) => { window.setTimeout(() => { setParticles((prev) => prev.filter((item) => item.id !== p.id)); }, Math.ceil(p.duration * 1000) + 120); });
  };

  const registerTap = async (event: MouseEvent<HTMLButtonElement>) => {
    setIsTapped(false);
    window.requestAnimationFrame(() => setIsTapped(true));
    setIsBumped(false);
    window.requestAnimationFrame(() => setIsBumped(true));
    const rect = event.currentTarget.getBoundingClientRect();
    spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
    try {
      const response = await fetch("/api/tap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId }) });
      if (!response.ok) { const msg = await readApiError(response, { fallbackMessage: "Tap could not be sent" }); throw new Error(msg); }
      const payload = (await response.json()) as { taps?: number };
      if (typeof payload.taps === "number") setLocalTapCount(payload.taps);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Tap failed."); }
  };

  if (!roomId) return <Navigate to="/" replace />;

  return (
    <main className="app-shell">
      <FloatingHearts />
      {loading ? <p className="text-muted-token">Connecting to your bond…</p> : null}
      {!loading && !exists ? <p className="text-danger-token">This room could not be found.</p> : null}

      {!loading && exists ? (
        <section className="sender-panel">
          <p className="eyebrow">💗 Sender</p>
          <h1 className="sender-title">Tap When You<br /><em style={{ fontStyle: "italic", background: "linear-gradient(100deg,#ff2d6b,#ff6b9d,#f5c882)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Miss Them</em></h1>
          <p className="sender-subtitle">Every tap is felt on their side, instantly.</p>

          {/* Tap button with rings */}
          <div className="send-tap-wrap" style={{ position: "relative", width: "168px", height: "168px", margin: "0 auto" }}>
            <TapRing active={isTapped} />
            <TapRing2 active={isTapped} />
            <button
              type="button"
              onClick={registerTap}
              className="sender-tap-btn"
              aria-label="Tap when you miss me"
              style={{ position: "relative", zIndex: 1 }}
            >
              <svg className="send-heart-icon" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 37.5C22 37.5 5 27 5 15.5C5 11.358 8.358 8 12.5 8C15.5 8 18.1 9.7 19.6 12.2L22 15.5L24.4 12.2C25.9 9.7 28.5 8 31.5 8C35.642 8 39 11.358 39 15.5C39 27 22 37.5 22 37.5Z" />
              </svg>
              <span className="send-btn-label">tap me</span>
            </button>
          </div>

          <div className="sender-count-wrap">
            <span className={`sender-count-num ${isBumped ? "is-bumped" : ""}`}>{label}</span>
            <p className="sender-count-label">{countLabel}</p>
          </div>

          {/* Decorative divider */}
          <div style={{ margin: "24px auto 0", height: "1px", width: "60px", background: "linear-gradient(90deg, transparent, rgba(255,107,157,0.35), transparent)" }} />

          {error ? <p className="text-danger-token mt-4 text-sm">{error}</p> : null}
        </section>
      ) : null}

      {particles.map((particle) => (
        <span
          key={particle.id}
          className="send-particle"
          style={{ left: `${particle.x}px`, top: `${particle.y}px`, fontSize: `${particle.size}px`, animationDuration: `${particle.duration}s`, ["--rot" as string]: `${particle.rot}deg`, ["--rot2" as string]: `${particle.rot2}deg` }}
        >
          {particle.symbol}
        </span>
      ))}
    </main>
  );
}

/* ─────────────────────── RECEIVE PAGE ──────────────────────────────── */
function ReceivePage() {
  const { roomId = "" } = useParams();
  const { taps, exists, loading } = useRoom(roomId);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerText, setBannerText] = useState("Enable notifications to feel every tap");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!roomId) return;
    const key = `missme-notif-${roomId}`;
    if (!localStorage.getItem(key)) setBannerVisible(true);
  }, [roomId]);

  useEffect(() => {
    let unsubscribe = () => {};
    subscribeForegroundNotifications((payload) => {
      const message = payload.notification?.body;
      if (message) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
    }).then((cleanup) => { unsubscribe = cleanup; });
    return () => unsubscribe();
  }, []);

  const enableNotifications = async () => {
    if (!roomId) return;
    const result = await requestReceiverNotifications(roomId);
    localStorage.setItem(`missme-notif-${roomId}`, "true");
    setBannerVisible(false);
    setBannerText(result.message);
  };

  if (!roomId) return <Navigate to="/" replace />;

  return (
    <main className="app-shell">
      <FloatingHearts />
      <section className="receiver-panel">
        {bannerVisible ? (
          <div className="receiver-banner">
            <p className="receiver-banner-text mb-3">
              🔔 Enable push notifications so every tap reaches you instantly.
            </p>
            <button onClick={enableNotifications} type="button" className="receiver-banner-btn">
              Turn On Notifications
            </button>
          </div>
        ) : (
          <p className="receiver-banner-status mb-4 text-sm font-semibold">{bannerText}</p>
        )}

        {loading ? <p className="text-muted-token">Connecting to your bond…</p> : null}
        {!loading && !exists ? <p className="text-danger-token">This room could not be found.</p> : null}

        {!loading && exists ? (
          <>
            <p className="eyebrow">🌸 Receiver</p>
            <h1 className="receiver-title">
              They're Thinking<br />
              <em style={{ fontStyle: "italic", background: "linear-gradient(100deg,#ff2d6b,#ff6b9d,#f5c882)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Of You</em>
            </h1>

            <AnimatePresence mode="wait">
              <motion.p
                key={taps}
                initial={{ opacity: 0.15, y: 12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0.2, y: -8 }}
                transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                className="receiver-count"
              >
                {taps.toLocaleString()}
              </motion.p>
            </AnimatePresence>

            <p className="receiver-caption mt-2">times they thought of you</p>

            {/* Decorative hearts row */}
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px", opacity: 0.45 }}>
              {["♥", "♥", "♥"].map((s, i) => (
                <span key={i} style={{ color: "#ff6b9d", fontSize: i === 1 ? "20px" : "12px", alignSelf: "center", animation: `heartbeat ${1.5 + i * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}>{s}</span>
              ))}
            </div>
            <style>{`
              @keyframes heartbeat {
                0%, 100% { transform: scale(1); }
                14%       { transform: scale(1.2); }
                28%       { transform: scale(1); }
                42%       { transform: scale(1.1); }
              }
            `}</style>
          </>
        ) : null}

        {toast ? (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="receiver-toast mt-4"
            style={{ background: "rgba(255,45,107,0.1)", padding: "10px 18px", borderRadius: "999px", border: "1px solid rgba(255,107,157,0.25)", display: "inline-block" }}
          >
            {toast}
          </motion.p>
        ) : null}
      </section>
    </main>
  );
}

/* ─────────────────────── 404 PAGE ──────────────────────────────────── */
function NotFoundPage() {
  return (
    <main className="app-shell">
      <section className="glass-panel">
        <p className="eyebrow">404</p>
        <p className="display-title">Signal Not Found</p>
        <p className="text-muted-token">That page is gone or the link is incomplete.</p>
        <Link to="/" className="glass-pill mt-6">← Back To Home</Link>
      </section>
    </main>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-credit">Created by Shravan Deb</p>
      <div className="site-footer-links" aria-label="Social links">
        <a
          href="https://instagram.com/shravnnn.d"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          className="site-footer-link"
        >
          <svg viewBox="0 0 24 24" className="site-footer-icon" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
          </svg>
        </a>
        <a
          href="https://github.com/ShravanDeb"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="site-footer-link"
        >
          <svg viewBox="0 0 24 24" className="site-footer-icon" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 .5C5.73.5.75 5.48.75 11.76c0 5.04 3.27 9.31 7.8 10.82.57.1.78-.25.78-.55 0-.27-.01-.99-.02-1.94-3.17.69-3.84-1.53-3.84-1.53-.52-1.31-1.27-1.66-1.27-1.66-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.53-.29-5.19-1.26-5.19-5.63 0-1.24.44-2.26 1.17-3.06-.12-.29-.51-1.46.11-3.04 0 0 .95-.3 3.12 1.17a10.9 10.9 0 0 1 5.68 0c2.16-1.47 3.11-1.17 3.11-1.17.62 1.58.23 2.75.11 3.04.73.8 1.17 1.82 1.17 3.06 0 4.38-2.66 5.33-5.2 5.62.41.35.77 1.03.77 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.66.79.55a11.28 11.28 0 0 0 7.79-10.82C23.25 5.48 18.27.5 12 .5Z"/>
          </svg>
        </a>
      </div>
    </footer>
  );
}

function RewardPage() {
  const [qrError, setQrError] = useState(false);

  return (
    <main className="app-shell px-5 py-8">
      <FloatingHearts />
      <section className="reward-panel">
        <p className="eyebrow">Support</p>
        <h1 className="display-title reward-title">Want to Give me a reward?</h1>
        <p className="reward-subtitle">
          If this project helped you, you can support my work by scanning the QR code below.
        </p>

        <div className="reward-qr-frame">
          {!qrError ? (
            <img
              src="/reward-qr.jpg"
              alt="Reward payment QR code"
              className="reward-qr"
              onError={() => setQrError(true)}
            />
          ) : (
            <div className="reward-qr-fallback">
              <p>QR code not found.</p>
              <p>Add your file as /public/reward-qr.svg or /public/reward-qr.png</p>
            </div>
          )}
        </div>

        <p className="reward-note">Thank you for your support.</p>
      </section>
    </main>
  );
}

/* ─────────────────────── APP ROOT ──────────────────────────────────── */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/share/:roomId" element={<SharePage />} />
        <Route path="/send/:roomId" element={<SendPage />} />
        <Route path="/receive/:roomId" element={<ReceivePage />} />
        <Route path="/reward" element={<RewardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <SiteFooter />
    </BrowserRouter>
  );
}