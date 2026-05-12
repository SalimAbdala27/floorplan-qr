import { Circle, Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function OvenHobSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);
  const burnerRadius = Math.min(width, height) * 0.1;
  const burnerXs = [width * 0.33, width * 0.67];
  const burnerYs = [height * 0.28, height * 0.52];

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill={CAD_FILL} stroke={CAD_STROKE} strokeWidth={stroke} />
      <Line points={[stroke, height * 0.68, width - stroke, height * 0.68]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      {burnerYs.map((by) =>
        burnerXs.map((bx) => (
          <Circle key={`${bx}-${by}`} x={bx} y={by} radius={burnerRadius} stroke={CAD_DETAIL} strokeWidth={stroke * 0.65} />
        ))
      )}
      <Rect x={width * 0.28} y={height * 0.76} width={width * 0.44} height={height * 0.12} fill={CAD_FILL} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line points={[width * 0.36, height * 0.82, width * 0.64, height * 0.82]} stroke={CAD_LIGHT} strokeWidth={stroke * 0.45} />
    </SymbolGroup>
  );
}
