export default function Grid({ size = 40 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(to right,#ececec 1px,transparent 1px),linear-gradient(to bottom,#ececec 1px,transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        pointerEvents: "none",
      }}
    />
  );
}
