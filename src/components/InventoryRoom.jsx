import InventoryChecklist from "./InventoryChecklist.jsx";
import MediaUploader from "./MediaUploader.jsx";
import PanoViewer from "./PanoViewer.jsx";

export default function InventoryRoom({
  room,
  roomInventory,
  onUpdateItem,
  onSetOverallCondition,
  onAddMedia,
  onRemoveMedia,
  onQuickCapture,
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-800">{room?.name || roomInventory.roomId}</p>
          <p className="text-xs text-zinc-500">Overall condition</p>
        </div>
        <select
          value={roomInventory.overallCondition || "fair"}
          onChange={(event) => onSetOverallCondition(event.target.value)}
          className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs"
        >
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>

      <div className="mt-3">
        <InventoryChecklist roomInventory={roomInventory} onUpdateItem={onUpdateItem} />
      </div>

      <div className="mt-3 space-y-2">
        <MediaUploader onAddMedia={onAddMedia} onQuickCapture={onQuickCapture} />

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {roomInventory.media.map((media) => (
            <div key={media.id} className="rounded-lg border border-zinc-200 p-2">
              {media.type === "pano" ? (
                <PanoViewer src={media.preview || media.url} alt="Panorama" />
              ) : (
                <img
                  src={media.preview || media.url}
                  alt="Inventory"
                  loading="lazy"
                  className="h-28 w-full rounded border border-zinc-200 object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => onRemoveMedia(media.id)}
                className="mt-2 h-8 w-full rounded-lg bg-red-100 text-[11px] font-semibold text-red-700"
              >
                Remove Media
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
