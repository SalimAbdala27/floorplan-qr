import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, CAD_SURFACE, cadDash, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function BedSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);
  const pillowHeight = height * 0.22;

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Rect
        x={stroke}
        y={stroke}
        width={(width - stroke * 3) / 2}
        height={Math.max(4, pillowHeight)}
        fill={CAD_SURFACE}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.7}
      />
      <Rect
        x={(width + stroke) / 2}
        y={stroke}
        width={(width - stroke * 3) / 2}
        height={Math.max(4, pillowHeight)}
        fill={CAD_SURFACE}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.7}
      />
      <Line points={[stroke, height * 0.42, width - stroke, height * 0.42]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line
        points={[width * 0.12, height * 0.82, width * 0.88, height * 0.82]}
        stroke={CAD_LIGHT}
        strokeWidth={stroke * 0.45}
        dash={cadDash(stroke)}
      />
    </SymbolGroup>
  );
}
