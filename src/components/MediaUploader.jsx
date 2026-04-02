function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImageMeta(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.src = dataUrl;
  });
}

export default function MediaUploader({ onAddMedia, onQuickCapture }) {
  const handleFile = async (file, quickMode = false) => {
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const meta = await loadImageMeta(dataUrl);
      const isPano = meta.width > meta.height * 2;

      const media = {
        id: `media_${Date.now()}`,
        type: isPano ? "pano" : "photo",
        url: dataUrl,
        preview: dataUrl,
      };

      if (quickMode) {
        onQuickCapture(media);
      } else {
        onAddMedia(media);
      }
    } catch {
      // ignore bad files
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
        Upload Photo / Pano
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0], false)}
        />
      </label>

      <label className="h-9 rounded-lg bg-emerald-700 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
        Quick Capture
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0], true)}
        />
      </label>
    </div>
  );
}
