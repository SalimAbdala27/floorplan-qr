import { Circle, Ellipse, Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function KitchenSinkSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Ellipse
        x={width * 0.38}
        y={height / 2}
        radiusX={width * 0.18}
        radiusY={height * 0.27}
        fill={CAD_FILL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.7}
      />
      <Ellipse
        x={width * 0.64}
        y={height / 2}
        radiusX={width * 0.18}
        radiusY={height * 0.27}
        fill={CAD_FILL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.7}
      />
      <Circle
        x={width * 0.51}
        y={height * 0.36}
        radius={Math.max(1.2, Math.min(width, height) * 0.025)}
        fill={CAD_DETAIL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.4}
      />
      <Line
        points={[width * 0.51, height * 0.24, width * 0.51, height * 0.36]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
    </SymbolGroup>
  );
}
