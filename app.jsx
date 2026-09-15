const { useState, useMemo, useEffect } = React;


const WORK_ENDPOINT = 'https://paxatori.tail5b8364.ts.net/api/work';

const PALETTES = [
  ['#C6A78D', '#6E7457'],
  ['#D8B7A1', '#8C3B27'],
  ['#B7C0B0', '#66705B'],
  ['#E1C8A8', '#B96A46'],
  ['#A9B7C0', '#5C6970'],
  ['#D7C5B5', '#806B5D'],
];

const NAV = [
  { key: 'portraits', label: 'Portraits' },
  { key: 'sports', label: 'Sports' },
  { key: 'street', label: 'Street' },
  { key: 'landscape', label: 'Landscape' },
  { key: 'about', label: 'About' },
];

function Tile({ item, index }) {
  const [c1, c2] = PALETTES[index % PALETTES.length];
  return (
    <figure
      className="group relative mb-4 break-inside-avoid overflow-hidden rounded-sm frame-in"
      style={{ animationDelay: `${(index % 9) * 60}ms` }}
    >
      <div
        className={`relative w-full ${item.tall ? 'aspect-[3/4]' : 'aspect-[4/3]'} overflow-hidden`}
        style={{
          background: `linear-gradient(155deg, ${c1} 0%, ${c2} 100%)`,
        }}
      >
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading={index < 3 ? 'eager' : 'lazy'}
            fetchPriority={index < 3 ? 'high' : 'low'}
            decoding="async"
          />
        )}
        <svg
          className={`absolute inset-0 h-full w-full mix-blend-overlay ${
            item.imageUrl ? 'opacity-10' : 'opacity-20'
          }`}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <defs>
            <filter id={`grain-${index}`}>
              <feTurbulence baseFrequency="0.9" numOctaves="2" seed={index} />
              <feColorMatrix type="saturate" values="0" />
            </filter>
          </defs>
          <rect width="100" height="100" filter={`url(#grain-${index})`} />
        </svg>
        <div className="absolute inset-0 flex items-end p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-t from-black/55 via-black/0 to-black/0">
          <p className="text-sand text-[13px] leading-snug">
            <span className="font-medium">{item.title}</span>
            <span className="block text-sand/80">{item.client} · {item.year}</span>
          </p>
        </div>
      </div>
    </figure>
  );
}

function Gallery({ items }) {
  return (
    <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 px-5 sm:px-8 py-8">
      {items.map((item, i) => <Tile key={item.title + i} item={item} index={i} />)}
    </div>
  );
}

function AboutPanel({ photo }) {
  return (
    <div className="mx-auto px-6 sm:px-10 py-14 grid gap-6 lg:max-w-[820px] lg:grid-cols-[minmax(0,1fr)_270px] lg:gap-10">
      <div className="max-w-2xl frame-in">
        <h1 className="font-serif text-[2.6rem] sm:text-[3.2rem] leading-[1.08] mb-7">
          Iris Chu is a photographer and video editor based in Los Angeles.
        </h1>
        <div className="space-y-6 text-[17px] leading-relaxed text-ink/80">
          <p>
            She is currently a student at Cal Poly Pomona, where she is pursuing a degree in engineering.
            In her free time, shes either exploring the city with her camera, creating new engineering projects, or editing videos for her YouTube channel.
          </p>
          <p>
            If you are curious about her work or would like to collaborate, please reach out via email. She is always open to new opportunities and collaborations.
          </p>
        </div>
        <div className="mt-10 pt-8 border-t border-ink/15 grid sm:grid-cols-2 gap-8 text-[17px]">
          <div>
            <p className="text-ink/50 mb-1">Contact</p>
            <a href="mailto:irischu2612+pportfolio@gmail.com" className="hover:text-brick transition-colors">
              irischu2612@gmail.com 
            </a>
          </div>
        </div>
        <div className="mt-10 flex gap-5 text-[17px] text-ink/70">
          <a href="#" className="hover:text-brick transition-colors">Instagram</a>
          <a href="#" className="hover:text-brick transition-colors">Engineering Portfolio</a>
        </div>
      </div>
      {photo && (
        <figure className="frame-in w-full self-start lg:pt-2">
          <div className="w-full overflow-hidden rounded-sm bg-clay/20">
            <img
              src={photo.imageUrl}
              alt={photo.title}
              className="block h-auto w-full object-contain"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </figure>
      )}
    </div>
  );
}

function Logo({ className }) {
  return (
    <div className={`font-serif italic tracking-tight leading-none ${className}`}>
      Iris Chu
    </div>
  );
}
const API_ORIGIN = new URL(WORK_ENDPOINT).origin;
function App() {
  const [active, setActive] = useState('selected-works');
  const [menuOpen, setMenuOpen] = useState(false);
  const [serverWork, setServerWork] = useState([]);
  const [photosError, setPhotosError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(WORK_ENDPOINT, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Photo request failed (${response.status})`);
        return response.json();
      })
      .then(payload => {
        const photos = Array.isArray(payload) ? payload : payload.photos;
        if (!Array.isArray(photos)) throw new Error('Photo response must be an array or contain a photos array');

        const normalizedPhotos = photos
          .filter(photo => photo && typeof photo.image === 'string' && photo.image.trim())
          .map((photo, index) => ({
            title: photo.title || `Server photo ${index + 1}`,
            year: photo.year || '',
            tall: photo.tall !== false,
            cat: typeof photo.cat === 'string' && photo.cat.trim() ? photo.cat : 'lifestyle',
            imageUrl: photo.image.startsWith('http') ? photo.image : `${API_ORIGIN}${photo.image}`,
          }));

        if (!cancelled) setServerWork(normalizedPhotos);
      })
      .catch(error => {
          if (!cancelled && error.name !== 'AbortError') setPhotosError(error.message);
      });

      return () => {
        cancelled = true;
        clearTimeout(timeout);
        controller.abort();
      };
  }, []);

  const work = serverWork;

  const filtered = useMemo(() => {
    if (active === 'about') return work;
    return work.filter(w => w.cat === active);
  }, [active, work]);

  const isAbout = active === 'about';
  const aboutPhoto = work.find(item => item.cat === 'about');

  useEffect(() => { setMenuOpen(false); }, [active]);

  return (
    <div className="min-h-screen lg:flex">

      {/* ---------- Left rail ---------- */}
      <header className="lg:w-64 lg:fixed lg:inset-y-0 lg:border-r border-ink/10 bg-sand z-20">
        <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-8 lg:py-10">
          <button onClick={() => setActive('selected-works')} className="text-left">
            <Logo className="text-xl" />
          </button>
          <button
            className="lg:hidden text-ink"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className={`${menuOpen ? 'block' : 'hidden'} lg:block px-5 lg:px-8 pb-6 lg:pb-0`}>
          <ul className="space-y-1 lg:space-y-2 text-[14px]">
            {NAV.map(n => (
              <li key={n.key}>
                <button
                  onClick={() => setActive(n.key)}
                  className={`block w-full text-left py-1.5 transition-colors ${
                    active === n.key ? 'text-brick' : 'text-ink/70 hover:text-ink'
                  }`}
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`${menuOpen ? 'block' : 'hidden'} lg:block px-5 lg:px-8 lg:absolute lg:bottom-10 pb-8 lg:pb-0 text-[13px] text-ink/60 leading-relaxed`}>
          <div className="flex gap-4 mb-5">
            <a href="https://www.instagram.com/irisphotos.jpeg/" className="hover:text-brick transition-colors">Instagram</a>
            <a href="#" className="hover:text-brick transition-colors">Engineering Portfolio</a>
          </div>
          <p>Contact<br /><a href="mailto:irischu2612+pportfolio@gmail.com" className="hover:text-brick transition-colors">irischu2612@gmail.com</a></p>
        </div>
      </header>

      {/* ---------- Main ---------- */}
      <main className="flex-1 lg:ml-64">
        {photosError && (
          <p className="px-5 pt-5 text-[13px] text-ink/60 sm:px-8">
            Server photos are unavailable; showing the local gallery.
          </p>
        )}
        {isAbout ? <AboutPanel photo={aboutPhoto} /> : <Gallery items={filtered} key={active} />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
