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

function formatStat(count, singular, plural = `${singular}s`) {
  if (!count) return null;
  return `${count} ${count === 1 ? singular : plural}`;
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
}) {
  const stats = deriveStats(home.rooms || [], floors || []);
  const features = splitFeatures(brochure.keyFeaturesText);
  const statPills = [
    formatStat(stats.bedrooms, "bedroom"),
    formatStat(stats.bathrooms, "bathroom"),
    formatStat(stats.receptions, "reception room"),
    formatStat(stats.floors, "floor"),
  ].filter(Boolean);

  const roomSummary = (home.rooms || []).map((room) => ({
    id: room.id,
    name: room.name,
    floor: floors.find((floor) => floor.id === room.floorId)?.name || "Unassigned floor",
    size: `${room.widthMeters || 4}m x ${room.heightMeters || 3}m`,
  }));

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
              <label className="text-[11px] font-medium text-zinc-600">
                Accent color
                <input
                  type="color"
                  value={brochure.accentColor}
                  onChange={(event) => onBrochureChange({ accentColor: event.target.value })}
                  className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-1"
                />
              </label>
            </div>

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
                <img
                  src={logoImage}
                  alt="Estate agent logo"
                  className="mt-2 h-14 w-auto rounded-lg border border-zinc-200 bg-white p-1"
                />
              ) : null}
            </div>

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
              </div>
            </div>

            <button
              type="button"
              onClick={onExportBrochure}
              className="h-10 w-full rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white"
            >
              Export Marketing Brochure PDF
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-white p-3 shadow-sm">
          <div
            className="overflow-hidden rounded-[22px] border border-zinc-200"
            style={{ backgroundColor: brochure.accentColor || "#dbeafe" }}
          >
            {heroImage ? (
              <img src={heroImage} alt={`${home.name} marketing`} className="h-64 w-full object-cover md:h-80" />
            ) : (
              <div className="flex h-64 items-center justify-center bg-zinc-200 text-sm font-medium text-zinc-500 md:h-80">
                Upload a hero image or add inventory photos for brochure visuals
              </div>
            )}
            <div className="bg-white px-4 py-4 md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {logoImage ? (
                    <img
                      src={logoImage}
                      alt="Estate agent logo"
                      className="mb-3 h-10 w-auto rounded-lg border border-zinc-200 bg-white p-1"
                    />
                  ) : null}
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {brochure.propertyType || "Property brochure"}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-900 md:text-3xl">
                    {brochure.addressLine || home.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    {brochure.headline || "Marketing-ready brochure generated from your saved property details."}
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-900 px-4 py-3 text-right text-white">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/70">Guide price</p>
                  <p className="mt-1 text-2xl font-semibold">{brochure.askingPrice || "Add asking price"}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {statPills.map((pill) => (
                  <span key={pill} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    {pill}
                  </span>
                ))}
                {brochure.tenure ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    {brochure.tenure}
                  </span>
                ) : null}
                {brochure.epcRating ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    EPC {brochure.epcRating}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Overview
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-700">
                    {brochure.summary ||
                      "Use this space to describe the home, its layout, the quality of finish, the setting, and who it is ideal for."}
                  </p>

                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Room schedule
                  </p>
                  <div className="mt-2 divide-y divide-zinc-200 rounded-2xl border border-zinc-200">
                    {roomSummary.map((room) => (
                      <div key={room.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold text-zinc-800">{room.name}</p>
                          <p className="text-[11px] text-zinc-500">{room.floor}</p>
                        </div>
                        <p className="text-[11px] font-medium text-zinc-600">{room.size}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Key features
                    </p>
                    <div className="mt-2 space-y-2">
                      {(features.length ? features : ["Add one feature per line to build the brochure highlights."]).map(
                        (feature) => (
                          <div key={feature} className="rounded-xl bg-white px-3 py-2 text-sm text-zinc-700">
                            {feature}
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Floorplan
                    </p>
                    <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                      {floorplanPreviewImage ? (
                        <img
                          src={floorplanPreviewImage}
                          alt={`${home.name} floorplan`}
                          className="h-48 w-full object-contain bg-white"
                        />
                      ) : (
                        <div className="flex h-48 items-center justify-center px-4 text-center text-sm text-zinc-500">
                          The brochure will use the floorplan generated in the app when exported.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Property gallery
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {selectedImages.length ? selectedImages.map((image) => (
                        <img
                          key={image.id}
                          src={image.url}
                          alt={image.roomName || "Brochure"}
                          className="h-24 w-full rounded-xl object-cover"
                        />
                      )) : (
                        <div className="col-span-2 flex h-24 items-center justify-center rounded-xl bg-white text-sm text-zinc-500">
                          Upload or select brochure images to show the property rooms.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-900 p-4 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                      Arrange a viewing
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {brochure.branchName || branding.companyName || "Your branch details"}
                    </p>
                    <div className="mt-3 space-y-1 text-sm text-white/85">
                      {brochure.agentName ? <p>{brochure.agentName}</p> : null}
                      {brochure.agentPhone ? <p>{brochure.agentPhone}</p> : null}
                      {brochure.agentEmail ? <p>{brochure.agentEmail}</p> : null}
                      {!brochure.agentName && !brochure.agentPhone && !brochure.agentEmail ? (
                        <p>Add contact details so the brochure is ready to send to applicants.</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
