import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { LINK_EVENT, readState, openSite } from '../lib/websiteLink';

// Nova Clipping: top-bar shortcut to the website, with the link status.
export default function WebsiteChip({ onOpenSettings }) {
  const [st, setSt] = useState(readState);
  useEffect(() => {
    const on = (e) => setSt(e.detail);
    window.addEventListener(LINK_EVENT, on);
    return () => window.removeEventListener(LINK_EVENT, on);
  }, []);
  const linked = !!st?.has_key;
  const ok = linked && st?.online !== false && !st?.refused;
  return (
    <button
      type="button"
      onClick={() => (linked ? openSite('/dashboard') : onOpenSettings())}
      className="btn-quiet px-3 py-1.5 text-xs shrink-0"
      title={linked ? `website: ${st.site_url}` : 'link the Nova Clipping website'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-ok' : 'bg-warn'}`} />
      <Globe size={14} />
      <span className="hidden sm:inline">{linked ? 'website' : 'link website'}</span>
    </button>
  );
}
