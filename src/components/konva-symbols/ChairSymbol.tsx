import { Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function ChairSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);
  const size = Math.min(width, height);
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;

  return (
    <SymbolGroup {...props}>
      <Rect
        x={offsetX}
        y={offsetY}
        width={size}
        height={size}
        fill="white"
        stroke="black"
        strokeWidth={stroke}
      />
    </SymbolGroup>
  );
}

