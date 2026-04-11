import { Circle, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function BathroomSinkSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);

  return (
    <SymbolGroup {...props}>
      <Rect
        x={width * 0.18}
        y={height * 0.18}
        width={width * 0.64}
        height={height * 0.64}
        fill="white"
        stroke="black"
        strokeWidth={stroke}
      />
      <Circle
        x={width / 2}
        y={height / 2}
        radius={Math.min(width, height) * 0.16}
        fill="white"
        stroke="black"
        strokeWidth={stroke * 0.8}
      />
    </SymbolGroup>
  );
}

