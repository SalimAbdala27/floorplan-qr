import { Group } from "react-konva";
import type { PropsWithChildren } from "react";
import type { FloorplanSymbolProps } from "./types";

type SymbolGroupProps = PropsWithChildren<FloorplanSymbolProps>;

export default function SymbolGroup({
  x,
  y,
  width,
  height,
  rotation = 0,
  children,
}: SymbolGroupProps) {
  return (
    <Group
      x={x + width / 2}
      y={y + height / 2}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={rotation}
    >
      {children}
    </Group>
  );
}

