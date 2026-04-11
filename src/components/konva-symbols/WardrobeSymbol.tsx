import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function WardrobeSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
      <Line points={[width / 2, stroke, width / 2, height - stroke]} stroke="black" strokeWidth={stroke * 0.8} />
    </SymbolGroup>
  );
}

