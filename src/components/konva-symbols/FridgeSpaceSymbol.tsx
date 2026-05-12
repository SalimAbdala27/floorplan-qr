import { Line, Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import { CAD_DETAIL, CAD_FILL, CAD_LIGHT, CAD_STROKE, cadDash, cadStroke } from "./cad";
import type { FloorplanSymbolProps } from "./types";

export default function FridgeSpaceSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = cadStroke(width, height);

  return (
    <SymbolGroup {...props}>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={CAD_FILL}
        stroke={CAD_STROKE}
        strokeWidth={stroke}
        dash={cadDash(stroke)}
      />
      <Line points={[stroke, height * 0.5, width - stroke, height * 0.5]} stroke={CAD_DETAIL} strokeWidth={stroke * 0.55} />
      <Line
        points={[width - stroke, height * 0.08, width + width * 0.1, height * 0.28, width + width * 0.1, height * 0.72, width - stroke, height * 0.92]}
        stroke={CAD_LIGHT}
        strokeWidth={stroke * 0.45}
        dash={cadDash(stroke)}
      />
    </SymbolGroup>
  );
}
