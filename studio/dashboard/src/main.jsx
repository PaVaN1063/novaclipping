import { StrictMode, useState, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Landing from './NovaLanding.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { capture as captureAttribution } from './lib/attribution'
import AccountPage from './components/AccountPage'
import LoginModal from './components/LoginModal'
import { applyConsent } from './lib/consent'
import { captureLinkFromHash } from './lib/websiteLink'

const App = lazy(() => import('./App.jsx'))

function PageShell({ title, children }) {
  return (
    <div className="min-h-screen bg-paper text-ink2">
      <header className="h-14 sm:h-16 border-b border-rule bg-paper flex items-center justify-between gap-3 px-4 sm:px-6 sticky top-0 z-20">
        <a href="#app" className="font-display lowercase text-lg text-ink truncate">nova clipping</a>
        <a href="#app" className="text-sm lowercase text-muted hover:text-ink transition-colors shrink-0">← <span className="hidden sm:inline">Back to app</span><span className="sm:hidden">back</span></a>
      </header>
      <main className="p-4 sm:p-6 md:p-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {title && <h1 className="font-display lowercase text-2xl sm:text-3xl text-ink text-center mb-6 sm:mb-10">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

function AccountView() {
  const { isSignedIn, loading } = useAuth();
  useEffect(() => {
    if (!loading && !isSignedIn) window.location.hash = '#app';
  }, [loading, isSignedIn]);
  return <PageShell><AccountPage /></PageShell>;
}

// Direct sign-in page (#/login), the URL handed to app-directory reviewers:
// the sign-in form opens straight away and a signed-in visitor goes to the app.
function LoginView() {
  const { isSignedIn, loading } = useAuth();
  const toApp = () => { window.location.hash = '#app'; };
  useEffect(() => {
    if (!loading && isSignedIn) toApp();
  }, [loading, isSignedIn]);
  return (
    <PageShell>
      {!loading && !isSignedIn && <LoginModal onClose={toApp} />}
    </PageShell>
  );
}

// Landing spot after an account is erased. Its own view because the session is
// gone: sending the user to #/account would bounce them to pricing with no
// explanation.
function DeletedView() {
  return (
    <div className="min-h-screen bg-paper text-ink2 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="font-display lowercase text-2xl sm:text-3xl text-ink">Your account is deleted</h1>
        <p className="text-sm">
          Your projects, clips and transcripts are gone, any subscription is
          cancelled, and your API keys no longer work. We've emailed you a
          confirmation with the details.
        </p>
        <p className="text-sm text-muted">
          You're welcome back any time — signing up again with the same address
          starts a brand-new, empty account.
        </p>
        <a href="#landing" className="btn-ghost px-4 py-2 inline-flex">Back to Nova Clipping</a>
      </div>
    </div>
  );
}

function Root() {
  const resolveView = () => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#/auth/')) return 'auth';       // AuthContext consumes then redirects
    if (hash.startsWith('#/account')) return 'account';
    if (hash.startsWith('#/deleted')) return 'deleted';
    if (hash.startsWith('#/login')) return 'login';
    // The app lives at #app (and #app?tab=… deep links). Everything else,
    // including a bare / and the section anchors (#features, #pricing…) and
    // #landing, is the landing page. There is deliberately no "returning
    // visitor" shortcut into the app: the static fallback is the landing, so
    // swapping it for the app after hydration made / jump a second after load,
    // and the logo of every page has to reach the landing.
    if (hash === '#app' || hash.startsWith('#app?') || hash === '#/app') return 'app';
    return 'landing';
  };

  const [view, setView] = useState(resolveView);

  useEffect(() => {
    const handleHashChange = () => setView(resolveView());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLaunchApp = () => {
    window.location.hash = '#app';
    setView('app');
  };

  if (view === 'login') return <LoginView />;
  if (view === 'account') return <AccountView />;
  if (view === 'deleted') return <DeletedView />;
  if (view === 'auth') {
    return <div className="min-h-screen flex items-center justify-center bg-background text-zinc-400">Signing you in…</div>;
  }
  if (view === 'app') return <App />;
  return <Landing onLaunchApp={handleLaunchApp} />;
}

// Before React mounts: AuthContext rewrites the URL on auth redirects, which
// would destroy the referrer and any UTM params we still need to read.
// Nova Clipping: back from the website's one-click link (#nova-link=…).
captureLinkFromHash();
captureAttribution();

// Start whatever the visitor previously agreed to. Nothing at all on a first
// visit: index.html only publishes the analytics initialiser, it never runs it.
applyConsent();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Suspense fallback={<div className="min-h-screen bg-paper flex items-center justify-center text-muted text-sm lowercase">loading…</div>}>
        <Root />
      </Suspense>
    </AuthProvider>
  </StrictMode>,
)
