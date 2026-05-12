import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function ChairSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);
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
        fill={CAD_FILL}
        stroke={CAD_STROKE}
        strokeWidth={stroke}
      />
      <Line points={[offsetX + size * 0.18, offsetY + size * 0.24, offsetX + size * 0.82, offsetY + size * 0.24]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line points={[offsetX + size * 0.18, offsetY + size * 0.76, offsetX + size * 0.82, offsetY + size * 0.76]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line points={[offsetX + size * 0.18, offsetY + size, offsetX + size * 0.18, offsetY + size * 1.16]} stroke={CAD_STROKE} strokeWidth={stroke * 0.75} />
      <Line points={[offsetX + size * 0.82, offsetY + size, offsetX + size * 0.82, offsetY + size * 1.16]} stroke={CAD_STROKE} strokeWidth={stroke * 0.75} />
    </SymbolGroup>
  );
}
