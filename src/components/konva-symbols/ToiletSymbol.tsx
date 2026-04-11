import { Ellipse, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function ToiletSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);

  return (
    <SymbolGroup {...props}>
      <Rect
        x={width * 0.3}
        y={height * 0.02}
        width={width * 0.4}
        height={height * 0.22}
        fill="white"
        stroke="black"
        strokeWidth={stroke}
      />
      <Ellipse
        x={width / 2}
        y={height * 0.62}
        radiusX={width * 0.26}
        radiusY={height * 0.32}
        fill="white"
        stroke="black"
        strokeWidth={stroke}
      />
    </SymbolGroup>
  );
}

