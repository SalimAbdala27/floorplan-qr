import Brochure from "./Brochure.jsx";
import ColorHexField from "./ColorHexField.jsx";

function countMatchingRooms(rooms, matchers) {
  return rooms.filter((room) => {
    const name = String(room.name || "").toLowerCase();
    return matchers.some((matcher) => name.includes(matcher));
  }).length;
}

function deriveStats(rooms, floors) {
  return {
    bedrooms: countMatchingRooms(rooms, ["bedroom", "bed "]),
    bathrooms: countMatchingRooms(rooms, ["bathroom", "ensuite", "downstairs wc", "upstairs wc", "wc"]),
    receptions: countMatchingRooms(rooms, ["living room", "reception", "lounge", "dining room"]),
    floors: floors.length || 1,
  };
}

function getEditableStat(value, fallback) {
  if (value === null || typeof value === "undefined") return String(fallback);
  return String(value);
}

function splitFeatures(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function MarketingBrochureFlow({
  home,
  brochure,
  floors,
  branding,
  heroImage,
  floorplanPreviewImage,
  logoImage,
  selectedImages,
  inventoryMedia,
  onBrochureChange,
  onHeroImageSelected,
  onRemoveHeroImage,
  onFloorplanImageSelected,
  onRemoveFloorplanImage,
  onLogoImageSelected,
  onRemoveLogoImage,
  onGalleryImagesSelected,
  onRemoveGalleryImage,
  onToggleInventoryMedia,
  onExportBrochure,
  canExportPdf = true,
}) {
  const derivedStats = deriveStats(home.rooms || [], floors || []);
  const stats = {
    bedrooms: getEditableStat(brochure.bedrooms, derivedStats.bedrooms),
    bathrooms: getEditableStat(brochure.bathrooms, derivedStats.bathrooms),
    receptions: getEditableStat(brochure.receptions, derivedStats.receptions),
    floors: getEditableStat(brochure.floors, derivedStats.floors),
  };
  const features = splitFeatures(brochure.keyFeaturesText);
  const roomSummary = (home.rooms || []).map((room) => ({
    id: room.id,
    name: room.name,
    floor: floors.find((floor) => floor.id === room.floorId)?.name || "Unassigned floor",
    size: `${room.widthMeters || 4}m x ${room.heightMeters || 3}m`,
  }));
  const brochureMeta = [
    { label: "Tenure", value: brochure.tenure },
    { label: "Council Tax", value: brochure.councilTaxBand },
    { label: "EPC Rating", value: brochure.epcRating ? `EPC ${brochure.epcRating}` : "" },
    { label: "Floors", value: stats.floors ? String(stats.floors) : "" },
  ];
  const brochureTitle = brochure.headline || brochure.propertyType || home.name;
  const brochureLocation = brochure.addressLine || home.name;
  const brochureGallery = selectedImages.map((image) => ({
    ...image,
    caption: image.caption || image.roomName || "Property image",
  }));
  const headerLogoImage = branding?.headerLogoDataUrl || "";

  return (
    <div className="flex-1 p-4">
      <div className="mx-auto grid w-full max-w-[23rem] gap-4 md:max-w-6xl md:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Marketing Brochure Builder
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add sales details and export a brochure using the property data already stored in this home.
          </p>

          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-medium text-zinc-600">
                Asking price
                <input
                  type="text"
                  value={brochure.askingPrice}
                  onChange={(event) => onBrochureChange({ askingPrice: event.target.value })}
                  placeholder="e.g. GBP 425,000"
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
              <label className="text-[11px] font-medium text-zinc-600">
                Property type
                <input
                  type="text"
                  value={brochure.propertyType}
                  onChange={(event) => onBrochureChange({ propertyType: event.target.value })}
                  placeholder="Detached house"
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
            </div>

            <label className="text-[11px] font-medium text-zinc-600">
              Marketing address
              <input
                type="text"
                value={brochure.addressLine}
                onChange={(event) => onBrochureChange({ addressLine: event.target.value })}
                placeholder="12 Example Street, Exampletown"
                className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-zinc-600">
                Tenure
                <input
                  type="text"
                  value={brochure.tenure}
                  onChange={(event) => onBrochureChange({ tenure: event.target.value })}
                  placeholder="Freehold"
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
              <label className="text-[11px] font-medium text-zinc-600">
                Council tax
                <input
                  type="text"
                  value={brochure.councilTaxBand}
                  onChange={(event) => onBrochureChange({ councilTaxBand: event.target.value })}
                  placeholder="Band D"
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-zinc-600">
                EPC rating
                <input
                  type="text"
                  value={brochure.epcRating}
                  onChange={(event) => onBrochureChange({ epcRating: event.target.value })}
                  placeholder="C"
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
              <ColorHexField
                label="Accent color"
                value={brochure.accentColor}
                fallback="#15803d"
                className="border-zinc-300"
                onChange={(accentColor) => onBrochureChange({ accentColor })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-zinc-600">
                Bedrooms
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={stats.bedrooms}
                  onChange={(event) => onBrochureChange({ bedrooms: event.target.value })}
                  placeholder={String(derivedStats.bedrooms)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
              <label className="text-[11px] font-medium text-zinc-600">
                Bathrooms
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={stats.bathrooms}
                  onChange={(event) => onBrochureChange({ bathrooms: event.target.value })}
                  placeholder={String(derivedStats.bathrooms)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
              <label className="text-[11px] font-medium text-zinc-600">
                Reception rooms
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={stats.receptions}
                  onChange={(event) => onBrochureChange({ receptions: event.target.value })}
                  placeholder={String(derivedStats.receptions)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
              <label className="text-[11px] font-medium text-zinc-600">
                Floors
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={stats.floors}
                  onChange={(event) => onBrochureChange({ floors: event.target.value })}
                  placeholder={String(derivedStats.floors)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </label>
            </div>

            <label className="text-[11px] font-medium text-zinc-600">
              Room list heading
              <input
                type="text"
                value={brochure.roomListTitle || ""}
                onChange={(event) => onBrochureChange({ roomListTitle: event.target.value })}
                placeholder="Rooms within the house"
                className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </label>

            <label className="text-[11px] font-medium text-zinc-600">
              Headline
              <input
                type="text"
                value={brochure.headline}
                onChange={(event) => onBrochureChange({ headline: event.target.value })}
                placeholder="Stylish family home with a flexible layout"
                className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </label>

            <label className="text-[11px] font-medium text-zinc-600">
              Brochure summary
              <textarea
                value={brochure.summary}
                onChange={(event) => onBrochureChange({ summary: event.target.value })}
                placeholder="Add a short sales description for portals, brochures, and viewings."
                className="mt-1 min-h-[110px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-[11px] font-medium text-zinc-600">
              Key features
              <textarea
                value={brochure.keyFeaturesText}
                onChange={(event) => onBrochureChange({ keyFeaturesText: event.target.value })}
                placeholder={"One feature per line\nSouth-facing garden\nRefitted kitchen\nOff-street parking"}
                className="mt-1 min-h-[110px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-[11px] font-semibold text-zinc-700">Estate agent logo</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                This logo will be used on the brochure PDF and preview.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onLogoImageSelected}
                  />
                </label>
                {logoImage ? (
                  <button
                    type="button"
                    onClick={onRemoveLogoImage}
                    className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                  >
                    Remove Logo
                  </button>
                ) : null}
              </div>
              {logoImage ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-[11px] font-semibold text-emerald-700">Logo uploaded</p>
                  <img
                    src={logoImage}
                    alt="Estate agent logo"
                    className="mt-2 h-14 w-auto rounded-lg border border-zinc-200 bg-white p-1"
                  />
                </div>
              ) : null}
            </div>

            {headerLogoImage ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                <p className="text-[11px] font-semibold text-zinc-700">Header logo banner</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  The brochure PDF will also use the saved header banner from branding.
                </p>
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-[11px] font-semibold text-emerald-700">Header logo ready</p>
                  <img
                    src={headerLogoImage}
                    alt="Brochure header logo"
                    className="mt-2 h-14 w-full rounded-lg border border-zinc-200 bg-white p-1 object-contain"
                  />
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-[11px] font-semibold text-zinc-700">Hero image</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Use a dedicated brochure image, or leave this blank to fall back to the first uploaded panorama/photo.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
                  Upload Hero
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onHeroImageSelected}
                  />
                </label>
                {brochure.heroImage ? (
                  <button
                    type="button"
                    onClick={onRemoveHeroImage}
                    className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                  >
                    Remove Hero
                  </button>
                ) : null}
              </div>
              {heroImage ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-[11px] font-semibold text-emerald-700">Hero image uploaded</p>
                  <img
                    src={heroImage}
                    alt="Brochure hero"
                    className="mt-2 h-28 w-full rounded-lg border border-zinc-200 object-cover"
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-[11px] font-semibold text-zinc-700">Brochure gallery images</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Upload brochure-only photos, or select existing inventory images room by room.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
                  Upload Gallery Images
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onGalleryImagesSelected}
                  />
                </label>
              </div>
              {brochure.galleryImages?.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {brochure.galleryImages.map((image) => (
                    <div key={image.id} className="rounded-xl border border-zinc-200 bg-white p-2">
                      <img src={image.url} alt={image.caption || "Uploaded"} className="h-24 w-full rounded-lg object-cover" />
                      <p className="mt-1 truncate text-[11px] text-zinc-600">{image.caption || "Uploaded image"}</p>
                      <button
                        type="button"
                        onClick={() => onRemoveGalleryImage(image.id)}
                        className="mt-2 h-8 w-full rounded-lg bg-zinc-200 text-[11px] font-semibold text-zinc-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-zinc-700">Use inventory media</p>
                <div className="mt-2 space-y-2">
                  {inventoryMedia.length ? inventoryMedia.map((media) => {
                    const checked = (brochure.selectedInventoryMediaIds || []).includes(media.id);
                    return (
                      <label
                        key={media.id}
                        className={`flex items-center gap-3 rounded-xl border px-2 py-2 ${
                          checked ? "border-zinc-800 bg-zinc-100" : "border-zinc-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleInventoryMedia(media.id)}
                          className="h-4 w-4 accent-zinc-800"
                        />
                        <img src={media.url} alt={media.roomName} className="h-14 w-20 rounded object-cover" />
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-zinc-700">{media.roomName}</p>
                          <p className="text-[11px] text-zinc-500">{media.type === "pano" ? "Panorama" : "Photo"}</p>
                        </div>
                      </label>
                    );
                  }) : (
                    <p className="text-[11px] text-zinc-500">No inventory media available yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-[11px] font-semibold text-zinc-700">Floorplan for brochure</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Choose whether the brochure uses the floorplan built in the app or an uploaded floorplan image.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onBrochureChange({ floorplanSource: "generated" })}
                  className={`h-9 rounded-lg text-[11px] font-semibold ${
                    brochure.floorplanSource === "generated"
                      ? "bg-zinc-800 text-white"
                      : "bg-white text-zinc-700 border border-zinc-300"
                  }`}
                >
                  Use App Floorplan
                </button>
                <button
                  type="button"
                  onClick={() => onBrochureChange({ floorplanSource: "uploaded" })}
                  className={`h-9 rounded-lg text-[11px] font-semibold ${
                    brochure.floorplanSource === "uploaded"
                      ? "bg-zinc-800 text-white"
                      : "bg-white text-zinc-700 border border-zinc-300"
                  }`}
                >
                  Use Uploaded Plan
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
                  Upload Floorplan
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFloorplanImageSelected}
                  />
                </label>
                {brochure.floorplanImage ? (
                  <button
                    type="button"
                    onClick={onRemoveFloorplanImage}
                    className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                  >
                    Remove Upload
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Current source: {brochure.floorplanSource === "uploaded" ? "Uploaded floorplan image" : "App-generated floorplan"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-[11px] font-semibold text-zinc-700">Agent details</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={brochure.branchName}
                  onChange={(event) => onBrochureChange({ branchName: event.target.value })}
                  placeholder="Branch / agency"
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
                />
                <input
                  type="text"
                  value={brochure.agentName}
                  onChange={(event) => onBrochureChange({ agentName: event.target.value })}
                  placeholder="Agent name"
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
                />
                <input
                  type="text"
                  value={brochure.agentPhone}
                  onChange={(event) => onBrochureChange({ agentPhone: event.target.value })}
                  placeholder="Phone"
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
                />
                <input
                  type="email"
                  value={brochure.agentEmail}
                  onChange={(event) => onBrochureChange({ agentEmail: event.target.value })}
                  placeholder="Email"
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
                />
                <input
                  type="url"
                  value={brochure.viewingLink || ""}
                  onChange={(event) => onBrochureChange({ viewingLink: event.target.value })}
                  placeholder="Viewing link / booking URL"
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm sm:col-span-2"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onExportBrochure}
              className="h-10 w-full rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white"
            >
              {canExportPdf ? "Export Marketing Brochure PDF" : "Unlock Marketing Brochure PDF"}
            </button>
            {!canExportPdf ? (
              <p className="text-[11px] text-amber-700">
                Brochure editing stays available, but the PDF export unlocks with an active subscription.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-white p-3 shadow-sm">
          <Brochure
            accentColor={brochure.accentColor || "#0f766e"}
            logo={logoImage}
            heroImage={heroImage}
            headerLogo={headerLogoImage}
            title={brochureTitle}
            location={brochureLocation}
            price={brochure.askingPrice}
            propertyType={brochure.propertyType}
            summary={brochure.summary}
            features={features}
            stats={stats}
            meta={brochureMeta}
            galleryImages={brochureGallery}
            floorplanImage={floorplanPreviewImage}
            rooms={roomSummary}
            roomListTitle={brochure.roomListTitle || "Rooms within the house"}
            branchName={brochure.branchName || branding.companyName}
            agentName={brochure.agentName}
            agentPhone={brochure.agentPhone}
            agentEmail={brochure.agentEmail}
            viewingLink={brochure.viewingLink}
          />
        </div>
      </div>
    </div>
  );
}
