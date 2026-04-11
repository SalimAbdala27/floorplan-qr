import { Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function BedSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);
  const pillowHeight = height * 0.22;

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
      <Rect
        x={stroke}
        y={stroke}
        width={width - stroke * 2}
        height={Math.max(4, pillowHeight)}
        fill="#f5f5f5"
        stroke="black"
        strokeWidth={stroke * 0.7}
      />
    </SymbolGroup>
  );
}

