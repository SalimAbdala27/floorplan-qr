import SignaturePad from "./SignaturePad.jsx";

export default function DeclarationForm({ declaration, onChange }) {
  const value = declaration || {};

  const update = (patch) => {
    onChange?.({
      ...value,
      ...patch,
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
        Declaration Form
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Capture a signed declaration now. We can wire this into QForm once you share that flow.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <input
          type="text"
          value={value.declarantName || ""}
          onChange={(event) => update({ declarantName: event.target.value })}
          placeholder="Declarant name"
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
        />
        <input
          type="text"
          value={value.declarantRole || ""}
          onChange={(event) => update({ declarantRole: event.target.value })}
          placeholder="Role / relationship"
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
        />
        <input
          type="datetime-local"
          value={value.declaredAt || ""}
          onChange={(event) => update({ declaredAt: event.target.value })}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
        />
      </div>

      <textarea
        value={value.statement || ""}
        onChange={(event) => update({ statement: event.target.value })}
        className="mt-3 min-h-[110px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />

      <div className="mt-3">
        <p className="text-xs font-semibold text-zinc-700">Signature</p>
        <div className="mt-2">
          <SignaturePad
            value={value.signatureDataUrl || ""}
            onChange={(signatureDataUrl) => update({ signatureDataUrl })}
          />
        </div>
      </div>
    </div>
  );
}
