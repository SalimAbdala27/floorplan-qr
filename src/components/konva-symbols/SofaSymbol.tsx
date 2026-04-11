import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function SofaSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
      <Line points={[stroke, height * 0.3, width - stroke, height * 0.3]} stroke="black" strokeWidth={stroke * 0.8} />
      <Line points={[stroke, height * 0.7, width - stroke, height * 0.7]} stroke="black" strokeWidth={stroke * 0.6} />
    </SymbolGroup>
  );
}

