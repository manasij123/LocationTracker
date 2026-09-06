export default function Skeleton({ height = 16, width = "100%", radius }: { height?: number | string; width?: number | string; radius?: number }) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: radius }}
    />
  );
}
