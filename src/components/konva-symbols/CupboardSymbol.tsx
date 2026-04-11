import { Rect } from "react-konva";
import SymbolGroup from "./SymbolGroup";
import type { FloorplanSymbolProps } from "./types";

export default function CupboardSymbol(props: FloorplanSymbolProps) {
  const { width, height } = props;
  const stroke = Math.max(1, Math.min(width, height) * 0.03);

  return (
    <SymbolGroup {...props}>
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="black" strokeWidth={stroke} />
    </SymbolGroup>
  );
}

