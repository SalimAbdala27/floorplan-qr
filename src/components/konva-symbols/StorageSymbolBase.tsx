import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function StorageSymbolBase(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);
  const thirds = [width / 3, (2 * width) / 3];

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      {thirds.map((x) => (
        <Line key={x} points={[x, stroke, x, height - stroke]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.6} />
      ))}
      <Line points={[stroke, height * 0.2, width - stroke, height * 0.2]} stroke={CAD_LIGHT} strokeWidth={stroke * 0.45} />
      <Line points={[width * 0.18, height * 0.58, width * 0.25, height * 0.58]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line points={[width * 0.49, height * 0.58, width * 0.56, height * 0.58]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line points={[width * 0.82, height * 0.58, width * 0.89, height * 0.58]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
    </SymbolGroup>
  );
}
