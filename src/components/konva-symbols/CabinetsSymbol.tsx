import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function CabinetsSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);
  const thirds = [width / 3, (2 * width) / 3];

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
      {thirds.map((x) => (
        <Line key={x} points={[x, stroke, x, height - stroke]} stroke="black" strokeWidth={stroke * 0.7} />
      ))}
    </SymbolGroup>
  );
}

