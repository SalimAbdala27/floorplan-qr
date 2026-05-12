import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_STROKE, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function BathSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);
  const cornerRadius = Math.min(width, height) * 0.2;

  return (
    <SymbolGroup {...props}>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        fill={CAD_FILL}
        stroke={CAD_STROKE}
        strokeWidth={stroke}
      />
      <Rect
        x={width * 0.08}
        y={height * 0.18}
        width={width * 0.84}
        height={height * 0.64}
        cornerRadius={Math.min(width, height) * 0.16}
        fill={CAD_FILL}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.65}
      />
      <Line
        points={[width * 0.12, height * 0.32, width * 0.28, height * 0.32]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
      <Line
        points={[width * 0.12, height * 0.42, width * 0.28, height * 0.42]}
        stroke={CAD_DETAIL}
        strokeWidth={stroke * 0.55}
      />
    </SymbolGroup>
  );
}
