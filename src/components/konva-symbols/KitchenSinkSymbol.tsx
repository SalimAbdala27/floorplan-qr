import { Circle, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function KitchenSinkSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);
  const bowlRadius = Math.min(width, height) * 0.2;

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
      <Circle
        x={width / 2}
        y={height / 2}
        radius={bowlRadius}
        fill="white"
        stroke="black"
        strokeWidth={stroke * 0.8}
      />
    </SymbolGroup>
  );
}

