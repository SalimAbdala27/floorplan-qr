import { Circle, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function OvenHobSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);
  const burnerRadius = Math.min(width, height) * 0.1;
  const burnerXs = [width * 0.33, width * 0.67];
  const burnerYs = [height * 0.33, height * 0.67];

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
      {burnerYs.map((by) =>
        burnerXs.map((bx) => (
          <Circle key={`${bx}-${by}`} x={bx} y={by} radius={burnerRadius} stroke="black" strokeWidth={stroke * 0.75} />
        ))
      )}
    </SymbolGroup>
  );
}

