import { Circle, Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function TableSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect x={width * 0.12} y={height * 0.12} width={width * 0.76} height={height * 0.76} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Line points={[width * 0.24, height * 0.26, width * 0.76, height * 0.26]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.5} />
      <Line points={[width * 0.24, height * 0.74, width * 0.76, height * 0.74]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.5} />
      <Circle x={width * 0.3} y={height * 0.5} radius={Math.max(1.2, Math.min(width, height) * 0.035)} fill={CAD_FILL} stroke={CAD_LIGHT} strokeWidth={stroke * 0.45} />
      <Circle x={width * 0.7} y={height * 0.5} radius={Math.max(1.2, Math.min(width, height) * 0.035)} fill={CAD_FILL} stroke={CAD_LIGHT} strokeWidth={stroke * 0.45} />
    </SymbolGroup>
  );
}
