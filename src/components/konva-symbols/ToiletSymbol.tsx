import { Ellipse, Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function ToiletSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect
        x={width * 0.3}
        y={height * 0.02}
        width={width * 0.4}
        height={height * 0.22}
        fill={CAD_FILL}
        stroke={CAD_STROKE}
        strokeWidth={stroke}
      />
      <Line
        points={[width * 0.36, height * 0.24, width * 0.64, height * 0.24]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
      <Ellipse
        x={width / 2}
        y={height * 0.62}
        radiusX={width * 0.26}
        radiusY={height * 0.32}
        fill={CAD_FILL}
        stroke={CAD_STROKE}
        strokeWidth={stroke}
      />
      <Ellipse
        x={width / 2}
        y={height * 0.62}
        radiusX={width * 0.13}
        radiusY={height * 0.14}
        fill={CAD_FILL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
    </SymbolGroup>
  );
}
