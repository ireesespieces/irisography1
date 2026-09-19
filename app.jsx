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
  { key: 'video', label: 'Videos' },
  { key: 'about', label: 'About' },
];

function isVideo(item) {
  return item.video === true ||
    item.mediaType === 'video' ||
    /\.(mp4|webm|ogg|mov|m4v)$/i.test(item.mediaUrl || item.src || item.imageUrl || '');
}

function Tile({ item, index }) {
  const videoRef = React.useRef(null);

  return (
    <figure
      className="group relative mb-4 break-inside-avoid overflow-hidden rounded-sm bg-ink/5 frame-in"
      style={{ animationDelay: `${(index % 9) * 60}ms` }}
    >
      <div className={`relative w-full ${item.tall ? 'aspect-[3/4]' : 'aspect-[4/3]'} overflow-hidden`}>
        {item.video ? (
          <video
            ref={videoRef}
            src={imageUrl(item.src)}
            poster={imageUrl(item.poster)}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="none"
            onMouseEnter={() => videoRef.current && videoRef.current.play()}
            onMouseLeave={() => {
              if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
              }
            }}
            controls
          />
        ) : (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
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
  const video = photo && isVideo(photo);
  return (
    <div className="mx-auto px-6 sm:px-10 py-14 grid gap-6 lg:max-w-[820px] lg:grid-cols-[minmax(0,1fr)_270px] lg:gap-10">
      <div className="max-w-2xl frame-in">
        <h1 className="font-serif text-[2.6rem] sm:text-[3.2rem] leading-[1.08] mb-7">
          Iris Chu is a photographer and video editor based in Los Angeles.
        </h1>
        <div className="space-y-6 text-[17px] leading-relaxed text-ink/80">
          <p>
            She is currently a student at Cal Poly Pomona, where she is pursuing a degree in engineering.
            In her free time, she's either exploring the city with her camera, creating new engineering projects, or editing videos for her YouTube channel.
          </p>
          <p>
            If you are curious about her work or would like to collaborate, please reach out via email. She is always open to new opportunities and collaborations.
          </p>
        </div>
        <div className="mt-10 pt-8 border-t border-ink/15 grid sm:grid-cols-2 gap-8 text-[17px]">
          <div>
            <p className="text-ink/50 mb-1">Contact</p>
            <a href="mailto:irischu2612@gmail.com" className="hover:text-brick transition-colors">
              irischu2612@gmail.com 
            </a>
          </div>
        </div>
        <div className="mt-10 flex gap-5 text-[17px] text-ink/70">
          <a href="https://www.instagram.com/irisphotos.jpeg/" className="hover:text-brick transition-colors">Instagram</a>
          <a href="#" className="hover:text-brick transition-colors">Engineering Portfolio</a>
        </div>
      </div>
      {photo && (
        <figure className="frame-in w-full self-start lg:pt-2">
          <div className="w-full overflow-hidden rounded-sm bg-clay/20">
            {video ? (
              <video
                src={photo.imageUrl}
                className="block h-auto w-full object-contain"
                controls
                playsInline
                preload="metadata"
                aria-label={photo.title}
              />
            ) : (
              <img
                src={photo.imageUrl}
                alt={photo.title}
                className="block h-auto w-full object-contain"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            )}
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

function imageUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
}

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
          .filter(photo => photo && (
            (typeof photo.image === 'string' && photo.image.trim()) ||
            (typeof photo.src === 'string' && photo.src.trim())
          ))
          .map((photo, index) => ({
            title: photo.title || `Server media ${index + 1}`,
            year: photo.year || '',
            tall: photo.tall !== false,
            cat: isVideo(photo)
              ? 'video'
              : (typeof photo.cat === 'string' && photo.cat.trim() ? photo.cat : 'lifestyle'),
            video: isVideo(photo),
            mediaType: isVideo(photo) ? 'video' : 'image',
            imageUrl: imageUrl(photo.image || photo.src),
            src: imageUrl(photo.src || photo.image),
            poster: imageUrl(photo.poster),
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
            <Logo className="text-2xl" />
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
          <p>Contact<br /><a href="mailto:irischu2612@gmail.com" className="hover:text-brick transition-colors">irischu2612@gmail.com</a></p>
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
