import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSessionBootstrap } from '../queries/session';
import {
  Truck,
  Box,
  MapPin,
  ShieldCheck,
  CreditCard,
  Navigation,
  CheckCircle2,
  Bus,
  Snowflake,
  CheckCircle,
  Navigation2
} from 'lucide-react';

const STATS = [
  { value: 120, suffix: '+', label: 'Active Routes', sub: 'Across 15 countries' },
  { value: 97, suffix: '%', label: 'On-Time Rate', sub: 'Industry-leading delivery' },
  { value: 500, suffix: '+', label: 'Verified Drivers', sub: 'Background-checked owners' },
  { value: 24, suffix: '/7', label: 'Support', sub: 'In-app, SMS & WhatsApp' }
];

function CountUp({ target, suffix, active }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const duration = 1400;
    const step = 16;
    const increment = target / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else setCount(Math.floor(start));
    }, step);
    return () => clearInterval(timer);
  }, [active, target]);
  return (
    <>
      {count}
      {suffix}
    </>
  );
}

const FLEET_TYPES = [
  {
    icon: <Box className="w-8 h-8" />,
    title: 'Matatu / Minibus',
    desc: 'Short distance urban and rural runs.',
    distance: '0 – 500 km',
    capacity: 'Up to 2 t'
  },
  {
    icon: <Truck className="w-8 h-8" />,
    title: 'Lorry / Pickup',
    desc: 'Flexible medium-load routing.',
    distance: '0 – 2,000 km',
    capacity: 'Up to 10 t'
  },
  {
    icon: <Truck className="w-8 h-8" strokeWidth={2.5} />,
    title: 'Large Truck',
    desc: 'Heavy cargo across borders.',
    distance: '0 – 10,000 km',
    capacity: 'Up to 30 t'
  },
  {
    icon: <Navigation2 className="w-8 h-8" />,
    title: 'Trailer / Semi',
    desc: 'Bulk cargo and containers.',
    distance: 'Continental',
    capacity: 'Up to 60 t'
  },
  {
    icon: <Bus className="w-8 h-8" />,
    title: 'Bus',
    desc: 'Passenger and mixed logistics.',
    distance: '0 – 5,000 km',
    capacity: 'Mixed'
  },
  {
    icon: <Snowflake className="w-8 h-8" />,
    title: 'Specialised',
    desc: 'Refrigerated, flatbed, tanker, crane.',
    distance: 'Custom routes',
    capacity: 'Custom'
  }
];

const HOW_STEPS = [
  {
    num: '01',
    title: 'Create Account',
    desc: 'Verify your business or personal identity in under 3 minutes. Shippers and fleet owners use the same onboarding.'
  },
  {
    num: '02',
    title: 'Post Your Request',
    desc: 'Select vehicle type, route, cargo details, date, and preferred payment method. Get a live price estimate before you confirm.'
  },
  {
    num: '03',
    title: 'Get Matched',
    desc: 'Receive bids from verified fleet owners or confirm an instant match based on your route and vehicle type.'
  },
  {
    num: '04',
    title: 'Track & Receive',
    desc: 'Follow live GPS updates until delivery. Proof of delivery, driver contact, and cargo photos are shared automatically.'
  }
];

const COVERAGE_LANES = [
  { from: 'Nairobi', to: 'Mombasa', km: '480 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Lagos', to: 'Abuja', km: '530 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Accra', to: 'Kumasi', km: '250 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Dar es Salaam', to: 'Dodoma', km: '450 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Cairo', to: 'Alexandria', km: '220 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Johannesburg', to: 'Durban', km: '570 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Lusaka', to: 'Livingstone', km: '470 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> },
  { from: 'Kampala', to: 'Jinja', km: '80 km', icon: <MapPin className="w-5 h-5 coverage-icon" /> }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { data: user } = useSessionBootstrap();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const navbar = document.getElementById('navbar');
      if (navbar) {
        if (window.scrollY > 20) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStatsVisible(true);
      },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setIsMenuOpen(false);
  };

  return (
    <div className="landing-container">
      <nav className={`navbar ${isMenuOpen ? 'open' : ''}`} id="navbar">
        <Link to="/" className="brand">
          <span className="brand-mark">iT</span> iTruck
        </Link>
        <div className={`nav-links ${isMenuOpen ? 'open' : ''}`} id="landing-navigation">
          <a
            href="#how"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('how');
            }}
          >
            How It Works
          </a>
          <a
            href="#fleet"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('fleet');
            }}
          >
            Fleet
          </a>
          <a
            href="#coverage"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('coverage');
            }}
          >
            Coverage
          </a>
          <Link to="/app/marketplace" onClick={() => setIsMenuOpen(false)}>
            Browse Trucks
          </Link>
        </div>
        <div className={`nav-actions ${isMenuOpen ? 'open' : ''}`} id="landing-actions">
          {user ? (
            <button className="primary-btn" onClick={() => navigate('/app')}>
              Go to Dashboard
            </button>
          ) : (
            <>
              <button className="ghost-btn" onClick={() => navigate('/login')}>
                Log In
              </button>
              <button className="primary-btn" onClick={() => navigate('/login?tab=register')}>
                Get Started
              </button>
            </>
          )}
        </div>
        <button
          className="icon-btn hamburger"
          type="button"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
          aria-controls="landing-navigation landing-actions"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      <main>
        {/* ── Hero ── */}
        <section className="hero">
          <div className="hero-overlay"></div>
          <div className="hero-copy animate-fade-in-up">
            <p className="eyebrow">African Freight Operations</p>
            <h1>Move freight across Africa with confidence.</h1>
            <p className="hero-text">
              Book verified trucks, compare clear prices, and follow your shipment from pickup to delivery in one simple
              workspace.
            </p>
            <div className="hero-actions">
              <button className="primary-btn" onClick={() => navigate(user ? '/app/book' : '/login')}>
                Start Shipping
              </button>
              <button
                className="secondary-btn glass-panel"
                onClick={() => navigate(user ? '/app/owner' : '/login?tab=register&role=owner')}
              >
                Register Your Fleet
              </button>
            </div>

            <div className="trust-strip">
              <span>
                <CheckCircle className="w-4 h-4 trust-check" /> Verified owners
              </span>
              <span>
                <ShieldCheck className="w-4 h-4 trust-check" /> Escrow protected
              </span>
              <span>
                <MapPin className="w-4 h-4 trust-check" /> GPS proof
              </span>
            </div>
          </div>
        </section>

        {/* ── Stats Band ── */}
        <section className="stats-band" ref={statsRef}>
          {STATS.map((s) => (
            <div key={s.label} className="stat-item">
              <div className="stat-value">
                <CountUp target={s.value} suffix={s.suffix} active={statsVisible} />
              </div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </section>

        {/* ── How It Works ── */}
        <section id="how" className="content-band how-band">
          <div className="section-heading text-center">
            <p className="eyebrow" style={{ color: 'var(--primary-mid)' }}>
              Simple Process
            </p>
            <h2>How iTruck works</h2>
            <p className="section-subtext">From first request to proof of delivery — done in four steps.</p>
          </div>
          <div className="how-steps">
            {HOW_STEPS.map((step, i) => (
              <div key={step.num} className="how-step">
                <div className="how-step-num">{step.num}</div>
                {i < HOW_STEPS.length - 1 && <div className="how-connector" />}
                <div className="how-step-body">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="how-cta">
            <button className="primary-btn pulse-btn" onClick={() => navigate(user ? '/app/book' : '/login')}>
              Book Your First Shipment
            </button>
          </div>
        </section>

        {/* ── Fleet ── */}
        <section id="fleet" className="content-band fleet-band">
          <div className="section-heading text-center">
            <p className="eyebrow" style={{ color: 'var(--primary-mid)' }}>
              Our Fleet
            </p>
            <h2>Every vehicle, every load</h2>
            <p className="section-subtext">
              From short urban runs to full cross-border hauls, we have the right vehicle for your cargo.
            </p>
          </div>
          <div className="grid-3">
            {FLEET_TYPES.map((f) => (
              <div key={f.title} className="fleet-card glass-panel">
                <div className="fleet-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="fleet-meta">
                  <span className="badge badge-primary">{f.distance}</span>
                  <span className="badge badge-accent">{f.capacity}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="how-cta">
            <Link to="/app/marketplace" className="primary-btn pulse-btn" style={{ textDecoration: 'none' }}>
              Browse Available Trucks
            </Link>
          </div>
        </section>

        {/* ── Coverage ── */}
        <section id="coverage" className="content-band coverage-band">
          <div className="coverage-inner">
            <div className="coverage-text">
              <p className="eyebrow" style={{ color: 'var(--primary-mid)' }}>
                Coverage
              </p>
              <h2>Across African trade lanes</h2>
              <p>
                From Nairobi to Lagos, Cairo to Cape Town — iTruck is built for regional routes, cross-border paperwork,
                low-bandwidth updates, and local payment methods including M-Pesa and MTN MoMo.
              </p>
              <ul className="coverage-features">
                <li>
                  <CheckCircle2 className="w-5 h-5 text-[var(--primary-mid)]" /> Cross-border documentation support
                </li>
                <li>
                  <CheckCircle2 className="w-5 h-5 text-[var(--primary-mid)]" /> Local currency &amp; mobile money
                  payments
                </li>
                <li>
                  <CheckCircle2 className="w-5 h-5 text-[var(--primary-mid)]" /> SMS &amp; low-bandwidth fallback
                  updates
                </li>
                <li>
                  <CheckCircle2 className="w-5 h-5 text-[var(--primary-mid)]" /> 15+ countries and growing
                </li>
              </ul>
              <button className="primary-btn pulse-btn" onClick={() => navigate(user ? '/app/book' : '/login')}>
                Find Routes
              </button>
            </div>
            <div className="coverage-lanes glass-panel">
              <p className="eyebrow" style={{ color: 'var(--primary-mid)', marginBottom: 16 }}>
                Active Trade Lanes
              </p>
              {COVERAGE_LANES.map((lane) => (
                <div key={`${lane.from}-${lane.to}`} className="lane-row hover-row">
                  <span className="lane-flag">{lane.icon}</span>
                  <span className="lane-route">
                    {lane.from} → {lane.to}
                  </span>
                  <span className="lane-km">{lane.km}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust & Safety ── */}
        <section className="content-band trust-band">
          <div className="section-heading text-center">
            <p className="eyebrow" style={{ color: 'var(--primary-mid)' }}>
              Trust &amp; Safety
            </p>
            <h2>Reliable transport, from request to delivery</h2>
          </div>
          <div className="grid-3">
            {[
              {
                icon: <ShieldCheck className="w-10 h-10" />,
                title: 'Checked vehicles',
                desc: 'Truck owners share vehicle documents, insurance details, routes, and availability before a client confirms a job.'
              },
              {
                icon: <CreditCard className="w-10 h-10" />,
                title: 'Clear payment steps',
                desc: 'Wallet, card, M-Pesa, or MTN MoMo — with a clear record of each payment stage and escrow-style release.'
              },
              {
                icon: <Navigation className="w-10 h-10" />,
                title: 'Live delivery updates',
                desc: 'Route progress, driver contact, cargo photos, issue reports, and proof of delivery shared automatically.'
              }
            ].map((item) => (
              <div key={item.title} className="trust-card glass-panel">
                <div className="trust-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="cta-band">
          <div className="cta-overlay"></div>
          <div className="cta-inner">
            <p className="eyebrow text-accent">Get Started Today</p>
            <h2>Ready to move your cargo across Africa?</h2>
            <p>Join thousands of shippers and fleet owners already on the platform.</p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="primary-btn hero-btn" onClick={() => navigate(user ? '/app/book' : '/login')}>
                Start Shipping
              </button>
              <button
                className="secondary-btn"
                onClick={() => navigate(user ? '/app/owner' : '/login?tab=register&role=owner')}
              >
                Register Your Fleet
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link to="/" className="brand">
              <span className="brand-mark">iT</span> iTruck
            </Link>
            <p className="footer-desc">
              Transport bookings, truck matching, shipment updates, and payment records for teams moving goods across
              Africa.
            </p>
          </div>

          <div className="footer-links-col">
            <h4>For Shippers</h4>
            <nav>
              <Link to="/app/book">Book a truck</Link>
              <Link to="/app/shipments">Track shipment</Link>
              <Link to="/app/marketplace">Browse vehicles</Link>
            </nav>
          </div>

          <div className="footer-links-col">
            <h4>For Owners</h4>
            <nav>
              <Link to="/app/owner">Fleet dashboard</Link>
              <Link to="/app/onboarding">Verification</Link>
              <Link to="/app/bids">Job board</Link>
            </nav>
          </div>

          <div className="footer-links-col">
            <h4>Coverage</h4>
            <nav>
              <span>East Africa</span>
              <span>West Africa</span>
              <span>Southern Africa</span>
              <span>North Africa</span>
              <span>Central Africa</span>
            </nav>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            iTruck Africa Ltd. Designed for regional freight, local payments, and long-distance road transport on
            priority African trade lanes.
          </p>
          <nav className="row" aria-label="Legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
