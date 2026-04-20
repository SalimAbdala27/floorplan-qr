import "./Brochure.css";

function formatCount(value, singular, plural = `${singular}s`) {
  if (!value && value !== 0) return "";
  return `${value} ${value === 1 ? singular : plural}`;
}

function PropertyStatIcon({ type }) {
  const commonProps = {
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    viewBox: "0 0 24 24",
  };

  if (type === "bath") {
    return (
      <svg {...commonProps}>
        <path d="M4 13h16" />
        <path d="M6 13V9a2 2 0 0 1 2-2h3" />
        <path d="M18 13v1a4 4 0 0 1-4 4H9a5 5 0 0 1-5-5v-1" />
        <path d="M10 7V5a2 2 0 1 1 4 0v2" />
      </svg>
    );
  }

  if (type === "reception") {
    return (
      <svg {...commonProps}>
        <path d="M5 12a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4H5z" />
        <path d="M7 16v3" />
        <path d="M17 16v3" />
        <path d="M8 9V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 11.5 8.5 7h7L20 11.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M8 20v-4h8v4" />
      <path d="M9 7V5h6v2" />
    </svg>
  );
}

function MiniIcon({ kind }) {
  const commonProps = {
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    viewBox: "0 0 24 24",
  };

  if (kind === "phone") {
    return (
      <svg {...commonProps}>
        <path d="M5 4h3l2 5-2 1.5a14 14 0 0 0 5.5 5.5L15 14l5 2v3a2 2 0 0 1-2 2C10.82 21 3 13.18 3 6a2 2 0 0 1 2-2z" />
      </svg>
    );
  }

  if (kind === "email") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m5 7 7 6 7-6" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function HeroSection({ title, location, price, heroImage, logo, propertyType, badges }) {
  return (
    <section className="brochure-card brochure-hero">
      {heroImage ? <img src={heroImage} alt={title} className="brochure-hero-media" /> : <div className="brochure-hero-fallback" />}
      <div className="brochure-hero-overlay" />
      <div className="brochure-hero-content">
        <div className="brochure-brandbar">
          <div className="brochure-brandmark">
            {logo ? <img src={logo} alt="Agency logo" /> : null}
            <div className="brochure-brandcopy">{propertyType || "Premium Listing"}</div>
          </div>
          <div className="brochure-price-pill">
            <div className="brochure-price-label">Guide Price</div>
            <div className="brochure-price-value">{price || "Price on application"}</div>
          </div>
        </div>

        <div className="brochure-hero-body">
          <div className="brochure-kicker">Magazine Style Brochure</div>
          <h1 className="brochure-hero-title">{title || "Marketing-ready property brochure"}</h1>
          <p className="brochure-hero-location">{location || "Add the property location to complete the brochure header."}</p>
          <div className="brochure-hero-badges">
            {badges.filter(Boolean).map((badge) => (
              <span key={badge} className="brochure-hero-badge">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewSection({ summary, stats, meta, features }) {
  const visibleMeta = meta.filter((item) => item.value);
  const statCards = [
    { key: "beds", label: "Bedrooms", value: stats.bedrooms || 0, type: "bed" },
    { key: "baths", label: "Bathrooms", value: stats.bathrooms || 0, type: "bath" },
    { key: "receptions", label: "Reception Rooms", value: stats.receptions || 0, type: "reception" },
  ];

  return (
    <section className="brochure-card brochure-section">
      <div className="brochure-kicker">Overview</div>
      <h2 className="brochure-section-title">A polished first impression, built around the essentials.</h2>
      <div className="brochure-divider" />
      <div className="brochure-overview-grid">
        <div className="brochure-description-card">
          <p className="brochure-description">
            {summary ||
              "Use the summary field to describe the space, finish, setting, and overall lifestyle appeal of the property in a concise, brochure-friendly way."}
          </p>
          {features.length ? (
            <div className="brochure-feature-list">
              {features.slice(0, 6).map((feature) => (
                <span key={feature} className="brochure-feature-pill">
                  {feature}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="brochure-stat-row">
            {statCards.map((stat) => (
              <div key={stat.key} className="brochure-stat-card">
                <div className="brochure-stat-icon">
                  <PropertyStatIcon type={stat.type} />
                </div>
                <div className="brochure-stat-value">{stat.value}</div>
                <div className="brochure-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {visibleMeta.length ? (
            <div className="brochure-meta-grid">
              {visibleMeta.map((item) => (
                <div key={item.label} className="brochure-meta-card">
                  <div className="brochure-meta-label">{item.label}</div>
                  <div className="brochure-meta-value">{item.value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GallerySection({ images }) {
  return (
    <section className="brochure-card brochure-section">
      <div className="brochure-gallery-header">
        <div>
          <div className="brochure-kicker">Gallery</div>
          <h2 className="brochure-section-title">Image-led presentation with room-by-room impact.</h2>
          <div className="brochure-divider" />
        </div>
      </div>

      {images.length ? (
        <div className="brochure-gallery-grid">
          {images.map((image, index) => (
            <article
              key={image.id || `${image.url}-${index}`}
              className={`brochure-gallery-card ${index === 0 ? "brochure-gallery-card--featured" : ""}`}
            >
              <img src={image.url} alt={image.roomName || image.caption || "Property photo"} />
              <div className="brochure-gallery-copy">
                <div>
                  <div className="brochure-gallery-room">{image.roomName || image.caption || "Property Image"}</div>
                  <div className="brochure-gallery-type">{image.type === "pano" ? "Panorama" : "Photography"}</div>
                </div>
                {image.type === "pano" ? <button type="button" className="brochure-360-chip">View 360</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brochure-empty">Upload brochure images or select inventory media to create a gallery.</div>
      )}
    </section>
  );
}

function FloorplanSection({ floorplanImage }) {
  return (
    <section className="brochure-card brochure-section">
      <div className="brochure-floorplan-card">
        <div className="brochure-kicker">Floorplan</div>
        <h2 className="brochure-section-title">Floorplan</h2>
        <div className="brochure-divider" style={{ marginLeft: "auto", marginRight: "auto" }} />
        <p className="brochure-section-copy">A clean layout keeps the brochure easy to understand at a glance.</p>
        <div className="brochure-floorplan-media">
          {floorplanImage ? (
            <img src={floorplanImage} alt="Property floorplan" />
          ) : (
            <div className="brochure-empty">The brochure will use the saved floorplan once one is available.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function RoomDetailsSection({ rooms }) {
  return (
    <section className="brochure-card brochure-section">
      <div className="brochure-kicker">Room Details</div>
      <h2 className="brochure-section-title">Simple, readable room dimensions.</h2>
      <div className="brochure-divider" />
      <div className="brochure-room-list">
        {rooms.length ? (
          rooms.map((room) => (
            <div key={room.id} className="brochure-room-item">
              <div>
                <div className="brochure-room-name">{room.name}</div>
                <div className="brochure-room-floor">{room.floor}</div>
              </div>
              <div className="brochure-room-size">{room.size}</div>
            </div>
          ))
        ) : (
          <div className="brochure-empty">Add rooms to the property to populate this section.</div>
        )}
      </div>
    </section>
  );
}

function ContactSection({ logo, branchName, agentName, phone, email, location, accentColor }) {
  const contacts = [
    { label: agentName || "Add agent name", icon: "location" },
    { label: phone || "Add phone number", icon: "phone" },
    { label: email || "Add email address", icon: "email" },
  ];

  return (
    <section className="brochure-card brochure-section brochure-contact" style={{ "--brochure-accent": accentColor || "#0f766e" }}>
      <div className="brochure-contact-grid">
        <div>
          <div className="brochure-kicker" style={{ color: "rgba(255,255,255,0.72)" }}>Arrange A Viewing</div>
          <h2 className="brochure-cta-title">Book a Viewing</h2>
          <p className="brochure-cta-copy">
            Speak with {branchName || "the sales team"} to arrange a viewing and talk through availability, timings,
            and the property’s standout features.
          </p>
          <button type="button" className="brochure-button">
            Book a Viewing
          </button>
        </div>

        <div className="brochure-contact-panel">
          {logo ? (
            <div className="brochure-contact-logo">
              <img src={logo} alt="Agency logo" />
            </div>
          ) : null}
          <div className="brochure-contact-list">
            <div className="brochure-contact-item">
              <span className="brochure-contact-icon">
                <MiniIcon kind="location" />
              </span>
              <span>{branchName || location || "Add branch details"}</span>
            </div>
            {contacts.map((item) => (
              <div key={item.icon} className="brochure-contact-item">
                <span className="brochure-contact-icon">
                  <MiniIcon kind={item.icon} />
                </span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Brochure({
  accentColor = "#0f766e",
  logo = "",
  heroImage = "",
  title = "",
  location = "",
  price = "",
  propertyType = "",
  summary = "",
  features = [],
  stats = {},
  meta = [],
  galleryImages = [],
  floorplanImage = "",
  rooms = [],
  branchName = "",
  agentName = "",
  agentPhone = "",
  agentEmail = "",
}) {
  const badges = [
    formatCount(stats.bedrooms, "Bed"),
    formatCount(stats.bathrooms, "Bath"),
    formatCount(stats.receptions, "Reception"),
    propertyType,
  ];

  return (
    <div className="brochure-shell" style={{ "--brochure-accent": accentColor || "#0f766e" }}>
      <div className="brochure-root">
        <div className="brochure-stack">
          <HeroSection
            title={title}
            location={location}
            price={price}
            heroImage={heroImage}
            logo={logo}
            propertyType={propertyType}
            badges={badges}
          />
          <OverviewSection summary={summary} stats={stats} meta={meta} features={features} />
          <GallerySection images={galleryImages} />
          <FloorplanSection floorplanImage={floorplanImage} />
          <RoomDetailsSection rooms={rooms} />
          <ContactSection
            logo={logo}
            branchName={branchName}
            agentName={agentName}
            phone={agentPhone}
            email={agentEmail}
            location={location}
            accentColor={accentColor}
          />
        </div>
      </div>
    </div>
  );
}
