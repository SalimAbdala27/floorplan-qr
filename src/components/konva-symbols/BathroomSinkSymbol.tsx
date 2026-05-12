import { Circle, Ellipse, Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, cadDash, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function BathroomSinkSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect
        x={width * 0.16}
        y={height * 0.12}
        width={width * 0.68}
        height={height * 0.76}
        fill={CAD_FILL}
        stroke={CAD_STROKE}
        strokeWidth={stroke}
      />
      <Ellipse
        x={width / 2}
        y={height * 0.57}
        radiusX={width * 0.2}
        radiusY={height * 0.18}
        fill={CAD_FILL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.75}
      />
      <Circle
        x={width / 2}
        y={height * 0.57}
        radius={Math.max(1.5, Math.min(width, height) * 0.035)}
        fill={CAD_FILL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
      <Line
        points={[width * 0.42, height * 0.29, width * 0.58, height * 0.29]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.65}
      />
      <Line
        points={[width / 2, height * 0.29, width / 2, height * 0.38]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.65}
      />
      <Line
        points={[width * 0.24, height * 0.8, width * 0.76, height * 0.8]}
        stroke={CAD_LIGHT}
        strokeWidth={stroke * 0.45}
        dash={cadDash(stroke)}
      />
    </SymbolGroup>
  );
}
