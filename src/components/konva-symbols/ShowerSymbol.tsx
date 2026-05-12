import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, cadDash, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function ShowerSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Line points={[stroke, stroke, width - stroke, height - stroke]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.65} />
      <Line points={[width - stroke, stroke, stroke, height - stroke]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.65} />
      <Line
        points={[width * 0.18, height * 0.22, width * 0.18, height * 0.78]}
        stroke={CAD_LIGHT}
        strokeWidth={stroke * 0.45}
        dash={cadDash(stroke)}
      />
      <Line
        points={[width * 0.22, height * 0.24, width * 0.31, height * 0.18]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
    </SymbolGroup>
  );
}
