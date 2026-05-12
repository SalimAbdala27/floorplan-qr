import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function SofaSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect x={width * 0.1} y={height * 0.2} width={width * 0.8} height={height * 0.62} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Rect x={0} y={height * 0.28} width={width * 0.12} height={height * 0.44} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Rect x={width * 0.88} y={height * 0.28} width={width * 0.12} height={height * 0.44} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Line points={[width * 0.1, height * 0.45, width * 0.9, height * 0.45]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.6} />
      <Line points={[width * 0.36, height * 0.2, width * 0.36, height * 0.82]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.5} />
      <Line points={[width * 0.64, height * 0.2, width * 0.64, height * 0.82]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.5} />
    </SymbolGroup>
  );
}
