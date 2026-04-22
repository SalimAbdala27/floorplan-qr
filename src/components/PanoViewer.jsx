import { useEffect, useRef, useState } from "react";

let pannellumAssetPromise = null;

function ensurePannellumAssets() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.pannellum) return Promise.resolve();
  if (pannellumAssetPromise) return pannellumAssetPromise;

  pannellumAssetPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("pannellum-css")) {
      const link = document.createElement("link");
      link.id = "pannellum-css";
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
      document.head.appendChild(link);
    }

    const onResolved = () => {
      if (window.pannellum) {
        resolve();
      } else {
        reject(new Error("Pannellum failed to load"));
      }
    };

    const existing = document.getElementById("pannellum-js");
    if (existing) {
      if (window.pannellum) {
        resolve();
        return;
      }
      existing.addEventListener("load", onResolved, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "pannellum-js";
    script.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
    script.async = true;
    script.onload = onResolved;
    script.onerror = reject;
    document.body.appendChild(script);
  }).catch((error) => {
    pannellumAssetPromise = null;
    throw error;
  });

  return pannellumAssetPromise;
}

export default function PanoViewer({ src, alt, heightClass = "h-80" }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const mountedRef = useRef(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    if (typeof window === "undefined") return undefined;

    let cancelled = false;

    const initViewer = async () => {
      try {
        if (mountedRef.current) setViewerReady(false);
        if (mountedRef.current) setViewerError(false);
        await ensurePannellumAssets();
        if (cancelled || !containerRef.current || !window.pannellum || !src) return;
        if (viewerRef.current?.destroy) {
          viewerRef.current.destroy();
          viewerRef.current = null;
        }

        viewerRef.current = window.pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: src,
          autoLoad: true,
          showControls: true,
          showZoomCtrl: true,
          draggable: true,
          mouseZoom: true,
        });
        if (mountedRef.current && !cancelled) setViewerReady(true);
      } catch {
        if (mountedRef.current && !cancelled) {
          setViewerReady(false);
          setViewerError(true);
        }
      }
    };

    initViewer();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (viewerRef.current?.destroy) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [src]);

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden rounded border border-zinc-200 bg-zinc-100`}>
      <div ref={containerRef} className="h-full w-full" />
      {!viewerReady ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {!viewerReady ? (
        <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/55 px-3 py-2 text-[11px] font-medium text-white backdrop-blur">
          {viewerError ? "Interactive 360 viewer unavailable on this device right now. The panorama image is still shown above." : "Loading 360 viewer..."}
        </div>
      ) : null}
    </div>
  );
}
